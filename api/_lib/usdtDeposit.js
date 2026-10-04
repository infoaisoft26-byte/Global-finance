import { HDNodeWallet } from 'ethers';
import crypto from 'node:crypto';
import { getPool, withTransaction } from './db.js';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO = '0x' + '0'.repeat(64);
const CONFIRMATIONS = 12;
const SCAN_CHUNK = 1500;
const ADDRESS_TOPIC_CHUNK = 150;

function boolEnv(name) {
  return String(process.env[name] || '').trim().toLowerCase() === 'true';
}

export function uniqueDepositConfigured() {
  return Boolean(
    boolEnv('PAYMENTS_ENABLED') &&
    boolEnv('USDT_RECHARGE_ENABLED') &&
    boolEnv('PAYMENT_AUTO_CREDIT_ENABLED') &&
    /^https?:\/\//i.test(String(process.env.BSC_RPC_URL || '').trim()) &&
    /^0x[0-9a-fA-F]{40}$/.test(String(process.env.USDT_BEP20_CONTRACT_ADDRESS || '').trim()) &&
    /^xpub[1-9A-HJ-NP-Za-km-z]{40,120}$/.test(String(process.env.BSC_DEPOSIT_XPUB || '').trim())
  );
}

export function addressGenerationConfigured() {
  return /^xpub[1-9A-HJ-NP-Za-km-z]{40,120}$/.test(String(process.env.BSC_DEPOSIT_XPUB || '').trim());
}

export async function ensureDepositSchema(client) {
  await client.query(`
    CREATE SEQUENCE IF NOT EXISTS usdt_deposit_address_seq
      AS bigint
      START WITH 0
      MINVALUE 0
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS usdt_deposit_addresses (
      user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      derivation_index BIGINT NOT NULL UNIQUE,
      address VARCHAR(42) NOT NULL UNIQUE CHECK (address ~ '^0x[0-9a-fA-F]{40}$'),
      network VARCHAR(16) NOT NULL DEFAULT 'BSC',
      token_symbol VARCHAR(16) NOT NULL DEFAULT 'USDT',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS usdt_deposit_events (
      id VARCHAR(96) PRIMARY KEY,
      tx_hash VARCHAR(66) NOT NULL,
      log_index BIGINT NOT NULL,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      deposit_address VARCHAR(42) NOT NULL,
      token_address VARCHAR(42) NOT NULL,
      amount_usdt NUMERIC(40,18) NOT NULL CHECK (amount_usdt > 0),
      raw_amount NUMERIC(78,0) NOT NULL CHECK (raw_amount > 0),
      block_number BIGINT NOT NULL,
      confirmations INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(16) NOT NULL DEFAULT 'credited' CHECK (status IN ('credited','ignored','pending')),
      ledger_id VARCHAR(64) UNIQUE REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      credited_at TIMESTAMPTZ
    )
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_usdt_deposit_event_tx_log
      ON usdt_deposit_events(tx_hash, log_index)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_usdt_deposit_events_user
      ON usdt_deposit_events(user_id, created_at DESC)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_usdt_deposit_events_status_block
      ON usdt_deposit_events(status, block_number)
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS usdt_deposit_scan_state (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      last_scanned_block BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    INSERT INTO usdt_deposit_scan_state(id,last_scanned_block)
    VALUES(1,0)
    ON CONFLICT(id) DO NOTHING
  `);
}

function deriveDepositAddress(index) {
  if (!addressGenerationConfigured()) throw new Error('DEPOSIT_XPUB_NOT_CONFIGURED');
  const xpub = String(process.env.BSC_DEPOSIT_XPUB).trim();
  const accountNode = HDNodeWallet.fromExtendedKey(xpub);
  const child = accountNode.deriveChild(0).deriveChild(Number(index));
  return child.address;
}

export async function getOrCreateDepositAddress(userId) {
  return withTransaction(async (client) => {
    await ensureDepositSchema(client);

    const existing = await client.query(
      'SELECT address,derivation_index FROM usdt_deposit_addresses WHERE user_id=$1 LIMIT 1',
      [userId]
    );
    if (existing.rowCount) {
      return {
        address: existing.rows[0].address,
        derivationIndex: Number(existing.rows[0].derivation_index),
      };
    }

    if (!addressGenerationConfigured()) throw new Error('DEPOSIT_XPUB_NOT_CONFIGURED');

    const next = await client.query(`SELECT nextval('usdt_deposit_address_seq')::bigint AS n`);
    const derivationIndex = Number(next.rows[0].n);
    const address = deriveDepositAddress(derivationIndex);

    await client.query(
      `INSERT INTO usdt_deposit_addresses(user_id,derivation_index,address)
       VALUES($1,$2,$3)`,
      [userId, derivationIndex, address]
    );

    return { address, derivationIndex };
  });
}

async function rpcCall(method, params) {
  const rpc = String(process.env.BSC_RPC_URL || '').trim();
  if (!rpc) throw new Error('BSC_RPC_NOT_CONFIGURED');

  const response = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('BSC_RPC_FAILED');

  const body = await response.json();
  if (body?.error || body?.result === undefined) throw new Error('BSC_RPC_FAILED');
  return body.result;
}

async function tokenDecimals() {
  const token = String(process.env.USDT_BEP20_CONTRACT_ADDRESS || '').trim();
  const result = await rpcCall('eth_call', [{ to: token, data: '0x313ce567' }, 'latest']);
  if (typeof result !== 'string' || !/^0x[0-9a-fA-F]+$/.test(result)) throw new Error('INVALID_TOKEN');
  const decimals = Number(BigInt(result));
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('INVALID_TOKEN');
  return decimals;
}

function topicForAddress(address) {
  return '0x' + address.slice(2).toLowerCase().padStart(64, '0');
}

function formatUnits(raw, decimals) {
  const value = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

async function creditDepositEvent(log, recipientAddress, addressToUser, decimals, safeHead) {
  const txHash = String(log.transactionHash || '').toLowerCase();
  const logIndex = BigInt(log.logIndex);
  const blockNumber = BigInt(log.blockNumber);
  const rawAmount = BigInt(log.data);
  const userId = addressToUser.get(recipientAddress.toLowerCase());
  if (!userId || rawAmount <= 0n) return 'ignored';

  const amountUsdt = formatUnits(rawAmount, decimals);
  const id = `BSCDEP-${txHash.slice(2, 18)}-${logIndex.toString()}`;
  const ledgerId = `DEP-${crypto.randomUUID().replaceAll('-', '').slice(0, 26)}`;

  return withTransaction(async (client) => {
    await ensureDepositSchema(client);

    const already = await client.query(
      'SELECT status FROM usdt_deposit_events WHERE tx_hash=$1 AND log_index=$2 LIMIT 1',
      [txHash, logIndex.toString()]
    );
    if (already.rowCount) return 'duplicate';

    const member = await client.query(
      `SELECT id,status,role FROM users WHERE id=$1 LIMIT 1 FOR UPDATE`,
      [userId]
    );
    if (!member.rowCount || member.rows[0].role !== 'user' || member.rows[0].status !== 'active') {
      await client.query(
        `INSERT INTO usdt_deposit_events(id,tx_hash,log_index,user_id,deposit_address,token_address,amount_usdt,raw_amount,block_number,confirmations,status)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ignored')`,
        [id,txHash,logIndex.toString(),userId,recipientAddress,String(process.env.USDT_BEP20_CONTRACT_ADDRESS).toLowerCase(),amountUsdt,rawAmount.toString(),blockNumber.toString(),Number(safeHead-blockNumber+1n)]
      );
      return 'ignored';
    }

    const wallet = await client.query(
      'SELECT user_id FROM wallets WHERE user_id=$1 FOR UPDATE',
      [userId]
    );
    if (!wallet.rowCount) {
      await client.query('INSERT INTO wallets(user_id) VALUES($1)', [userId]);
      await client.query('SELECT user_id FROM wallets WHERE user_id=$1 FOR UPDATE', [userId]);
    }

    const creditResult = await client.query(
      'SELECT ROUND($1::numeric,2)::text AS credit',
      [amountUsdt]
    );
    const walletCredit = String(creditResult.rows[0]?.credit || '0.00');
    if (!/^\d+\.\d{2}$/.test(walletCredit) || Number(walletCredit) <= 0) {
      await client.query(
        `INSERT INTO usdt_deposit_events(id,tx_hash,log_index,user_id,deposit_address,token_address,amount_usdt,raw_amount,block_number,confirmations,status)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ignored')`,
        [id,txHash,logIndex.toString(),userId,recipientAddress,String(process.env.USDT_BEP20_CONTRACT_ADDRESS).toLowerCase(),amountUsdt,rawAmount.toString(),blockNumber.toString(),Number(safeHead-blockNumber+1n)]
      );
      return 'ignored';
    }

    await client.query(
      `INSERT INTO ledger_transactions(
         id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata
       ) VALUES($1,$2,'usdt_bep20_auto_deposit','fund_wallet','credit',$3,0,$3,$4,$5,'completed',$6::jsonb)`,
      [
        ledgerId,
        userId,
        walletCredit,
        `Automatic USDT BEP20 deposit from ${txHash.slice(0,14)}…`,
        `BSCDEP:${txHash}:${logIndex.toString()}`,
        JSON.stringify({
          txHash,
          logIndex: logIndex.toString(),
          blockNumber: blockNumber.toString(),
          tokenAddress: String(process.env.USDT_BEP20_CONTRACT_ADDRESS).toLowerCase(),
          depositAddress: recipientAddress,
          amountUsdt,
          walletCreditUsdt: walletCredit,
          confirmations: Number(safeHead-blockNumber+1n),
          automatic: true,
        }),
      ]
    );

    await client.query(
      'UPDATE wallets SET fund_wallet=fund_wallet+$1,updated_at=NOW() WHERE user_id=$2',
      [walletCredit,userId]
    );

    await client.query(
      `INSERT INTO usdt_deposit_events(
        id,tx_hash,log_index,user_id,deposit_address,token_address,amount_usdt,raw_amount,block_number,confirmations,status,ledger_id,credited_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'credited',$11,NOW())`,
      [id,txHash,logIndex.toString(),userId,recipientAddress,String(process.env.USDT_BEP20_CONTRACT_ADDRESS).toLowerCase(),amountUsdt,rawAmount.toString(),blockNumber.toString(),Number(safeHead-blockNumber+1n),ledgerId]
    );

    await client.query(
      `INSERT INTO audit_logs(id,actor_user_id,actor_email,action,entity_type,entity_id,metadata)
       VALUES($1,'SYSTEM',NULL,'USDT_DEPOSIT_AUTO_CREDITED','ledger',$2,$3::jsonb)`,
      [
        crypto.randomUUID(),
        ledgerId,
        JSON.stringify({ userId, txHash, logIndex: logIndex.toString(), amountUsdt, walletCreditUsdt: walletCredit, depositAddress: recipientAddress }),
      ]
    );

    return 'credited';
  });
}

export async function scanAndCreditDeposits() {
  if (!uniqueDepositConfigured()) return { configured: false, scannedTo: null, found: 0, credited: 0 };

  const headHex = await rpcCall('eth_blockNumber', []);
  const head = BigInt(headHex);
  if (head <= BigInt(CONFIRMATIONS - 2)) {
    return { configured: true, scannedTo: null, found: 0, credited: 0 };
  }
  const safeHead = head - BigInt(CONFIRMATIONS) + 1n;

  const token = String(process.env.USDT_BEP20_CONTRACT_ADDRESS).trim().toLowerCase();
  const decimals = Number(process.env.USDT_BEP20_DECIMALS || await tokenDecimals());

  const result = await withTransaction(async (client) => {
    await ensureDepositSchema(client);

    const addresses = await client.query(
      `SELECT user_id,address FROM usdt_deposit_addresses WHERE active=true ORDER BY derivation_index ASC`
    );
    const addressToUser = new Map(addresses.rows.map(r => [String(r.address).toLowerCase(), r.user_id]));
    if (!addressToUser.size) return { configured: true, scannedTo: null, found: 0, credited: 0, addresses: 0 };

    const state = await client.query(
      'SELECT last_scanned_block FROM usdt_deposit_scan_state WHERE id=1 FOR UPDATE'
    );
    let last = BigInt(state.rows[0]?.last_scanned_block || 0);
    if (last === 0n) {
      const start = String(process.env.BSC_DEPOSIT_START_BLOCK || '').trim();
      last = /^\d+$/.test(start) ? BigInt(start) : (safeHead > 200n ? safeHead - 200n : 0n);
    }

    let scannedTo = last;
    let found = 0;
    let credited = 0;

    const addressRows = [...addressToUser.keys()];
    for (let from = last + 1n; from <= safeHead; from += BigInt(SCAN_CHUNK)) {
      const to = from + BigInt(SCAN_CHUNK) - 1n > safeHead ? safeHead : from + BigInt(SCAN_CHUNK) - 1n;

      for (let i = 0; i < addressRows.length; i += ADDRESS_TOPIC_CHUNK) {
        const batch = addressRows.slice(i, i + ADDRESS_TOPIC_CHUNK);
        const logs = await rpcCall('eth_getLogs', [{
          address: token,
          fromBlock: '0x' + from.toString(16),
          toBlock: '0x' + to.toString(16),
          topics: [TRANSFER_TOPIC, null, batch.map(topicForAddress)],
        }]);

        for (const log of Array.isArray(logs) ? logs : []) {
          if (
            String(log.address || '').toLowerCase() !== token ||
            !Array.isArray(log.topics) ||
            log.topics.length !== 3 ||
            String(log.topics[0]).toLowerCase() !== TRANSFER_TOPIC ||
            !/^0x[0-9a-fA-F]{64}$/.test(String(log.topics[2])) ||
            !/^0x[0-9a-fA-F]{64}$/.test(String(log.data || ''))
          ) continue;

          const recipient = '0x' + String(log.topics[2]).slice(-40).toLowerCase();
          found += 1;
          const outcome = await creditDepositEvent(log, recipient, addressToUser, decimals, safeHead);
          if (outcome === 'credited') credited += 1;
        }
      }

      scannedTo = to;
      await client.query(
        'UPDATE usdt_deposit_scan_state SET last_scanned_block=$1,updated_at=NOW() WHERE id=1',
        [scannedTo.toString()]
      );
    }

    return { configured: true, scannedTo: scannedTo.toString(), found, credited, addresses: addressToUser.size };
  });

  return result;
}
