import { HDNodeWallet } from 'ethers';
import { getFirestoreAdmin } from './firebaseAdmin.js';
import { withTransaction } from './db.js';
import { applyDepositReferralIncome, ensureIncomeSchema } from './incomeEngine.js';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const CONFIRMATIONS = 12;
const SCAN_CHUNK = 800;
const ADDRESS_TOPIC_CHUNK = 100;
const DEFAULT_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';

function boolEnv(name) {
  return String(process.env[name] || '').trim().toLowerCase() === 'true';
}

function contractAddress() {
  // Global Finance accepts USDT on BNB Smart Chain only. Keep the known
  // BEP20 token as the default, while still allowing an explicit override.
  return String(process.env.USDT_BEP20_CONTRACT_ADDRESS || DEFAULT_CONTRACT).trim().toLowerCase();
}

function xpubConfigured() {
  return /^xpub[1-9A-HJ-NP-Za-km-z]{40,120}$/.test(String(process.env.BSC_DEPOSIT_XPUB || '').trim());
}

export function addressGenerationConfigured() {
  const hasDatabase = Boolean(
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.NEON_DATABASE_URL
  );
  return Boolean(
    boolEnv('PAYMENTS_ENABLED') &&
    boolEnv('USDT_RECHARGE_ENABLED') &&
    boolEnv('PAYMENT_AUTO_CREDIT_ENABLED') &&
    /^https?:\/\//i.test(String(process.env.BSC_RPC_URL || '').trim()) &&
    /^0x[0-9a-f]{40}$/.test(contractAddress()) &&
    xpubConfigured() &&
    hasDatabase
  );
}

export function uniqueDepositConfigured() {
  return addressGenerationConfigured();
}

async function rpcCall(method, params) {
  const rpc = String(process.env.BSC_RPC_URL || '').trim();
  if (!/^https?:\/\//i.test(rpc)) throw new Error('BSC_RPC_NOT_CONFIGURED');
  let response;
  try {
    response = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('BSC_RPC_FAILED');
  }
  if (!response.ok) throw new Error('BSC_RPC_FAILED');
  const body = await response.json().catch(() => null);
  if (!body || body.error || body.result === undefined) throw new Error('BSC_RPC_FAILED');
  return body.result;
}

function deriveDepositAddress(index) {
  if (!xpubConfigured()) throw new Error('DEPOSIT_XPUB_NOT_CONFIGURED');
  const node = HDNodeWallet.fromExtendedKey(String(process.env.BSC_DEPOSIT_XPUB).trim());
  // BSC/EVM addresses derived below an account-level extended public key:
  // external branch 0, followed by a non-hardened per-member index.
  return node.deriveChild(0).deriveChild(index).address.toLowerCase();
}

function decimal8(raw, decimals) {
  const amount = BigInt(raw);
  if (amount <= 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  let units8;
  if (decimals > 8) {
    const divisor = 10n ** BigInt(decimals - 8);
    if (amount % divisor !== 0n) return null; // never silently round a deposit
    units8 = amount / divisor;
  } else {
    units8 = amount * (10n ** BigInt(8 - decimals));
  }
  if (units8 <= 0n) return null;
  const whole = units8 / 100000000n;
  const fraction = (units8 % 100000000n).toString().padStart(8, '0').replace(/0+$/, '');
  const text = fraction ? `${whole}.${fraction}` : String(whole);
  return { units8: units8.toString(), text, number: Number(units8) / 100000000 };
}

function topicForAddress(address) {
  return '0x' + String(address).slice(2).toLowerCase().padStart(64, '0');
}

async function getTokenDecimals() {
  const token = contractAddress();
  if (!/^0x[0-9a-f]{40}$/.test(token)) throw new Error('INVALID_TOKEN');
  const result = await rpcCall('eth_call', [{ to: token, data: '0x313ce567' }, 'latest']);
  if (typeof result !== 'string' || !/^0x[0-9a-f]+$/i.test(result)) throw new Error('INVALID_TOKEN');
  const decimals = Number(BigInt(result));
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('INVALID_TOKEN');
  return decimals;
}

function safeStartBlock(head) {
  // The scanner only consumes blocks with the configured confirmation depth.
  // Initialize at (or behind) that safe head; setting this to head - 2 would
  // leave the cursor permanently ahead of the confirmed scan head.
  const safeHead = head >= BigInt(CONFIRMATIONS)
    ? head - BigInt(CONFIRMATIONS) + 1n
    : 0n;
  const configured = String(process.env.BSC_DEPOSIT_START_BLOCK || '').trim();
  if (/^\d+$/.test(configured)) {
    const desired = BigInt(configured);
    return desired <= safeHead ? desired : safeHead;
  }
  return safeHead;
}
async function ensurePgDepositSchema() {
  await withTransaction(async (client) => {
    await ensureIncomeSchema(client);

    // Fund-wallet and ledger precision is expanded safely so verified USDT
    // deposits can retain 8 decimal places. Existing 2-decimal records do not change.
    const columns = await client.query(`
      SELECT table_name, column_name, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND data_type = 'numeric'
        AND (
          (table_name = 'wallets' AND column_name = 'fund_wallet') OR
          (table_name = 'ledger_transactions' AND column_name IN ('amount','fee','net_amount'))
        )
    `);
    const scales = new Map(columns.rows.map((row) => [`${row.table_name}.${row.column_name}`, Number(row.numeric_scale)]));
    if ((scales.get('wallets.fund_wallet') ?? 0) < 8) {
      await client.query('ALTER TABLE wallets ALTER COLUMN fund_wallet TYPE NUMERIC(28,8) USING fund_wallet::NUMERIC(28,8)');
    }
    for (const column of ['amount', 'fee', 'net_amount']) {
      if ((scales.get(`ledger_transactions.${column}`) ?? 0) < 8) {
        await client.query(`ALTER TABLE ledger_transactions ALTER COLUMN ${column} TYPE NUMERIC(28,8) USING ${column}::NUMERIC(28,8)`);
      }
    }

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
        status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('credited','ignored','pending')),
        ledger_id VARCHAR(64) UNIQUE REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        credited_at TIMESTAMPTZ,
        firestore_synced BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await client.query('ALTER TABLE usdt_deposit_events ADD COLUMN IF NOT EXISTS firestore_synced BOOLEAN NOT NULL DEFAULT FALSE');
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS uq_usdt_deposit_event_tx_log ON usdt_deposit_events(tx_hash, log_index)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_usdt_deposit_events_user ON usdt_deposit_events(user_id, created_at DESC)');
  });
}


export async function getOrCreateDepositAddress(userId) {
  if (!addressGenerationConfigured()) throw new Error('DEPOSIT_NOT_CONFIGURED');
  if (!String(userId || '').trim()) throw new Error('ACTIVE_MEMBER_REQUIRED');

  const db = getFirestoreAdmin();
  const addressRef = db.collection('usdtDepositAddresses').doc(userId);
  const existing = await addressRef.get();
  if (existing.exists && existing.data()?.address) {
    const record = existing.data();
    return { address: String(record.address), derivationIndex: Number(record.derivationIndex) };
  }

  const userRef = db.collection('users').doc(userId);
  const [headHex, _chainId] = await Promise.all([
    rpcCall('eth_blockNumber', []),
    rpcCall('eth_chainId', []),
  ]);
  if (_chainId !== '0x38') throw new Error('WRONG_NETWORK');
  if (typeof headHex !== 'string' || !/^0x[0-9a-f]+$/i.test(headHex)) throw new Error('BSC_RPC_FAILED');
  const initialCursor = safeStartBlock(BigInt(headHex));

  return db.runTransaction(async (transaction) => {
    const sequenceRef = db.collection('systemMetadata').doc('usdtDepositAddressSequence');
    const scanStateRef = db.collection('systemMetadata').doc('usdtDepositScanState');
    const [userSnap, addressSnap, sequenceSnap, scanStateSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(addressRef),
      transaction.get(sequenceRef),
      transaction.get(scanStateRef),
    ]);

    if (addressSnap.exists && addressSnap.data()?.address) {
      const record = addressSnap.data();
      return { address: String(record.address), derivationIndex: Number(record.derivationIndex) };
    }
    const user = userSnap.data() || {};
    if (!userSnap.exists || user.status !== 'active' || (user.role && user.role !== 'user')) {
      throw new Error('ACTIVE_MEMBER_REQUIRED');
    }

    const index = Math.max(0, Number(sequenceSnap.data()?.nextIndex || 0));
    if (!Number.isSafeInteger(index)) throw new Error('DEPOSIT_INDEX_INVALID');
    const address = deriveDepositAddress(index);
    const now = new Date().toISOString();

    transaction.set(sequenceRef, { nextIndex: index + 1, updatedAt: now }, { merge: true });
    transaction.set(addressRef, {
      userId,
      address,
      derivationIndex: index,
      network: 'BSC',
      tokenSymbol: 'USDT',
      active: true,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    // Initialize the scanner before showing the first address to a member. A
    // small overlap prevents a transfer in a nearby block from being skipped.
    if (!scanStateSnap.exists) {
      transaction.set(scanStateRef, { lastScannedBlock: initialCursor.toString(), updatedAt: now }, { merge: true });
    }
    return { address, derivationIndex: index };
  });
}

export async function getMemberDepositDetails(userId) {
  const db = getFirestoreAdmin();
  const deposit = await getOrCreateDepositAddress(userId);
  const snap = await db.collection('usdtDepositEvents').where('userId', '==', userId).get();
  const deposits = snap.docs
    .map((doc) => {
      const value = doc.data() || {};
      return {
        id: doc.id,
        txHash: String(value.txHash || ''),
        amountUsdt: String(value.amountUsdt || '0'),
        status: String(value.status || 'pending'),
        confirmations: Number(value.confirmations || 0),
        blockNumber: String(value.blockNumber || ''),
        createdAt: String(value.createdAt || ''),
        creditedAt: value.creditedAt ? String(value.creditedAt) : null,
        note: value.note ? String(value.note) : null,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);

  return {
    configured: true,
    network: 'BNB Smart Chain (BEP20)',
    token: 'USDT',
    contractAddress: contractAddress(),
    depositAddress: deposit.address,
    derivationIndex: deposit.derivationIndex,
    confirmationsRequired: CONFIRMATIONS,
    deposits,
  };
}

async function creditDepositEvent(db, log, addressToUser, decimals, safeHead) {
  const txHash = String(log.transactionHash || '').toLowerCase();
  const logIndex = BigInt(log.logIndex).toString();
  const blockNumber = BigInt(log.blockNumber);
  const rawAmount = BigInt(log.data);
  const recipient = '0x' + String(log.topics?.[2] || '').slice(-40).toLowerCase();
  const userId = addressToUser.get(recipient);
  if (!userId || rawAmount <= 0n) return 'ignored';

  const exact = decimal8(rawAmount, decimals);
  const eventKey = `${txHash}:${logIndex}`;
  const eventHash = crypto.createHash('sha256').update(eventKey).digest('hex');
  const eventId = `BSCDEP-${eventHash.slice(0, 40)}`;
  const ledgerId = `DEP_${eventHash.slice(0, 48)}`;
  const tokenAddress = contractAddress();
  const confirmations = Number(safeHead - blockNumber + 1n);
  const now = new Date().toISOString();

  if (!exact) {
    const eventRef = db.collection('usdtDepositEvents').doc(eventId);
    await eventRef.set({
      txHash, logIndex, userId, depositAddress: recipient, tokenAddress,
      amountUsdt: '0', rawAmount: rawAmount.toString(), blockNumber: blockNumber.toString(),
      confirmations, status: 'pending',
      note: 'Token precision exceeds the supported 8 decimal places. Contact support; do not resubmit the transaction.',
      createdAt: now,
    }, { merge: true });
    return 'pending';
  }

  const userSnap = await db.collection('users').doc(userId).get();
  const profile = userSnap.data() || {};
  if (!userSnap.exists || profile.status !== 'active' || (profile.role && profile.role !== 'user')) {
    await db.collection('usdtDepositEvents').doc(eventId).set({
      txHash, logIndex, userId, depositAddress: recipient, tokenAddress,
      amountUsdt: exact.text, rawAmount: rawAmount.toString(), blockNumber: blockNumber.toString(),
      confirmations, status: 'ignored',
      note: 'Account is not active; contact support for review.',
      createdAt: now,
    }, { merge: true });
    return 'ignored';
  }
  const email = String(profile.email || '').trim().toLowerCase();
  const name = String(profile.name || '').trim();
  const referralCode = String(profile.referralCode || '').trim().toUpperCase();
  if (!email || !name || !/^GF\d{6}$/.test(referralCode)) {
    throw new Error('MEMBER_PROFILE_INCOMPLETE');
  }

  const pgResult = await withTransaction(async (client) => {
    // The PostgreSQL wallet is used by package purchases. Credit it first in
    // an idempotent SQL transaction, then mirror the same ledger entry to
    // Firestore for the live dashboard balance.
    await client.query(
      `INSERT INTO users(id,email,name,phone,referral_code,sponsor_id,role,status,kyc_status,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,'user','active',$7,NOW(),NOW())
       ON CONFLICT(id) DO NOTHING`,
      [userId,email,name,profile.phone ? String(profile.phone) : null,referralCode,profile.sponsorId ? String(profile.sponsorId) : null,String(profile.kycStatus || 'unverified')]
    );
    const member = await client.query('SELECT id,email,role,status FROM users WHERE id=$1 FOR UPDATE', [userId]);
    if (!member.rowCount || member.rows[0].status !== 'active' || member.rows[0].role !== 'user') {
      // An existing suspended/admin account must never receive a member deposit.
      await client.query(
        `INSERT INTO usdt_deposit_events(id,tx_hash,log_index,user_id,deposit_address,token_address,amount_usdt,raw_amount,block_number,confirmations,status)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ignored')
         ON CONFLICT(tx_hash,log_index) DO UPDATE SET status='ignored',confirmations=EXCLUDED.confirmations`,
        [eventId,txHash,logIndex,userId,recipient,tokenAddress,exact.text,rawAmount.toString(),blockNumber.toString(),confirmations]
      );
      return { status: 'ignored', firestoreSynced: false };
    }

    await client.query(
      `INSERT INTO usdt_deposit_events(id,tx_hash,log_index,user_id,deposit_address,token_address,amount_usdt,raw_amount,block_number,confirmations,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')
       ON CONFLICT(tx_hash,log_index) DO NOTHING`,
      [eventId,txHash,logIndex,userId,recipient,tokenAddress,exact.text,rawAmount.toString(),blockNumber.toString(),confirmations]
    );
    const existing = await client.query(
      'SELECT status,ledger_id,firestore_synced FROM usdt_deposit_events WHERE tx_hash=$1 AND log_index=$2 FOR UPDATE',
      [txHash,logIndex]
    );
    const event = existing.rows[0];
    if (!event) throw new Error('DEPOSIT_EVENT_WRITE_FAILED');
    if (event.status === 'ignored') return { status: 'ignored', firestoreSynced: false };
    if (event.status === 'credited') return {
      status: 'credited',
      ledgerId: event.ledger_id || ledgerId,
      firestoreSynced: Boolean(event.firestore_synced),
    };

    await client.query('INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING', [userId]);
    await client.query('SELECT user_id FROM wallets WHERE user_id=$1 FOR UPDATE', [userId]);

    await client.query(
      `INSERT INTO ledger_transactions(
        id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata
      ) VALUES($1,$2,'usdt_bep20_auto_deposit','fund_wallet','credit',$3,0,$3,$4,$5,'completed',$6::jsonb)
      ON CONFLICT(id) DO NOTHING`,
      [
        ledgerId,userId,exact.text,
        'Automatically verified USDT deposit on BNB Smart Chain (BEP20)',
        `${txHash}:${logIndex}`,
        JSON.stringify({
          asset: 'USDT', network: 'BSC', txHash, logIndex,
          blockNumber: blockNumber.toString(), depositAddress: recipient,
          tokenAddress, amountUsdt: exact.text, confirmations, automatic: true,
        }),
      ]
    );
    await client.query(
      'UPDATE wallets SET fund_wallet=fund_wallet+$1,updated_at=NOW() WHERE user_id=$2',
      [exact.text,userId]
    );
    // Credit referral commissions in the same transaction as the verified deposit.
    // The TXID is the idempotency key; a scanner retry cannot pay twice.
    await applyDepositReferralIncome(client, {
      depositId:eventId,userId,amount:exact.number,txHash,
    });
    await client.query(
      `UPDATE usdt_deposit_events
       SET status='credited',ledger_id=$3,confirmations=$4,credited_at=NOW(),firestore_synced=FALSE
       WHERE tx_hash=$1 AND log_index=$2`,
      [txHash,logIndex,ledgerId,confirmations]
    );
    return { status: 'credited', ledgerId, firestoreSynced: false };
  });

  if (pgResult.status !== 'credited') {
    await db.collection('usdtDepositEvents').doc(eventId).set({
      txHash, logIndex, userId, depositAddress: recipient, tokenAddress,
      amountUsdt: exact.text, rawAmount: rawAmount.toString(), blockNumber: blockNumber.toString(),
      confirmations, status: 'ignored',
      note: 'Account is not eligible for automatic credit; contact support for review.',
      createdAt: now,
    }, { merge: true });
    return 'ignored';
  }

  // Idempotent Firestore mirror: a retry after partial failure will see the
  // deterministic ledger document and will not increment the visible wallet twice.
  const eventRef = db.collection('usdtDepositEvents').doc(eventId);
  const ledgerRef = db.collection('transactions').doc(pgResult.ledgerId || ledgerId);
  const walletRef = db.collection('wallets').doc(userId);
  const auditRef = db.collection('auditLogs').doc(pgResult.ledgerId || ledgerId);
  await db.runTransaction(async (transaction) => {
    const [eventSnap, ledgerSnap, walletSnap] = await Promise.all([
      transaction.get(eventRef), transaction.get(ledgerRef), transaction.get(walletRef),
    ]);
    const alreadyMirrored = eventSnap.exists &&
      eventSnap.data()?.status === 'credited' &&
      ledgerSnap.exists;
    if (alreadyMirrored) return;

    if (!ledgerSnap.exists) {
      const wallet = walletSnap.exists ? walletSnap.data() || {} : {};
      const fund = Number(wallet.fundWallet || 0);
      if (!Number.isFinite(fund) || !Number.isFinite(exact.number)) throw new Error('WALLET_AMOUNT_INVALID');
      transaction.set(walletRef, {
        ...wallet,
        userId,
        fundWallet: Number((fund + exact.number).toFixed(8)),
        updatedAt: now,
      }, { merge: true });
      transaction.set(ledgerRef, {
        id: pgResult.ledgerId || ledgerId, userId,
        type: 'usdt_bep20_auto_deposit', category: 'fund_wallet', flow: 'credit',
        amount: exact.number, fee: 0, netAmount: exact.number,
        description: 'Automatic USDT deposit via BNB Smart Chain (BEP20)',
        referenceId: `${txHash}:${logIndex}`, status: 'completed',
        metadata: {
          asset: 'USDT', network: 'BSC', txHash, logIndex,
          blockNumber: blockNumber.toString(), depositAddress: recipient,
          tokenAddress, amountUsdt: exact.text, confirmations, automatic: true,
        },
        createdAt: now,
      });
    }
    transaction.set(eventRef, {
      txHash, logIndex, userId, depositAddress: recipient, tokenAddress,
      amountUsdt: exact.text, rawAmount: rawAmount.toString(),
      blockNumber: blockNumber.toString(), confirmations,
      status: 'credited', ledgerId: pgResult.ledgerId || ledgerId,
      createdAt: now, creditedAt: now,
    }, { merge: true });
    transaction.set(auditRef, {
      actorUserId: 'SYSTEM', actorEmail: null,
      action: 'USDT_DEPOSIT_AUTO_CREDITED', entityType: 'ledger',
      entityId: pgResult.ledgerId || ledgerId,
      metadata: { userId, txHash, logIndex, amountUsdt: exact.text, depositAddress: recipient },
      timestamp: now,
    }, { merge: true });
  });

  // If the mirror succeeded but updating this flag failed, the next scan
  // safely replays the deterministic Firestore write without a second credit.
  await withTransaction(async (client) => {
    await client.query(
      'UPDATE usdt_deposit_events SET firestore_synced=TRUE WHERE tx_hash=$1 AND log_index=$2 AND status=\'credited\'',
      [txHash,logIndex]
    );
  });
  return 'credited';
}

export async function scanAndCreditDeposits() {
  if (!uniqueDepositConfigured()) {
    return { configured: false, scannedTo: null, found: 0, credited: 0, reason: 'DEPOSIT_NOT_CONFIGURED' };
  }

  const db = getFirestoreAdmin();
  await ensurePgDepositSchema();
  const [chainId, headHex, decimals] = await Promise.all([
    rpcCall('eth_chainId', []),
    rpcCall('eth_blockNumber', []),
    getTokenDecimals(),
  ]);
  if (chainId !== '0x38') throw new Error('WRONG_NETWORK');
  if (typeof headHex !== 'string' || !/^0x[0-9a-f]+$/i.test(headHex)) throw new Error('BSC_RPC_FAILED');

  const head = BigInt(headHex);
  if (head < BigInt(CONFIRMATIONS)) return { configured: true, scannedTo: null, found: 0, credited: 0 };
  const safeHead = head - BigInt(CONFIRMATIONS) + 1n;

  const addressSnap = await db.collection('usdtDepositAddresses').where('active', '==', true).get();
  const addressToUser = new Map();
  for (const doc of addressSnap.docs) {
    const record = doc.data() || {};
    const address = String(record.address || '').toLowerCase();
    const userId = String(record.userId || doc.id);
    if (/^0x[0-9a-f]{40}$/.test(address) && userId) addressToUser.set(address, userId);
  }
  if (!addressToUser.size) return { configured: true, scannedTo: null, found: 0, credited: 0, addresses: 0 };

  const stateRef = db.collection('systemMetadata').doc('usdtDepositScanState');
  const stateSnap = await stateRef.get();
  let last = BigInt(stateSnap.data()?.lastScannedBlock || '0');
  if (!stateSnap.exists) {
    // Address allocation initializes this cursor before displaying an address.
    last = safeStartBlock(safeHead);
    await stateRef.set({ lastScannedBlock: last.toString(), updatedAt: new Date().toISOString() }, { merge: true });
  }

  let scannedTo = last;
  let found = 0;
  let credited = 0;
  const addresses = [...addressToUser.keys()];

  for (let from = last + 1n; from <= safeHead; from += BigInt(SCAN_CHUNK)) {
    const to = from + BigInt(SCAN_CHUNK) - 1n > safeHead ? safeHead : from + BigInt(SCAN_CHUNK) - 1n;
    for (let offset = 0; offset < addresses.length; offset += ADDRESS_TOPIC_CHUNK) {
      const batch = addresses.slice(offset, offset + ADDRESS_TOPIC_CHUNK);
      const logs = await rpcCall('eth_getLogs', [{
        address: contractAddress(),
        fromBlock: '0x' + from.toString(16),
        toBlock: '0x' + to.toString(16),
        topics: [TRANSFER_TOPIC, null, batch.map(topicForAddress)],
      }]);
      for (const log of Array.isArray(logs) ? logs : []) {
        if (
          String(log.address || '').toLowerCase() !== contractAddress() ||
          !Array.isArray(log.topics) || log.topics.length !== 3 ||
          String(log.topics[0] || '').toLowerCase() !== TRANSFER_TOPIC ||
          !/^0x[0-9a-f]{64}$/i.test(String(log.topics[2] || '')) ||
          !/^0x[0-9a-f]+$/i.test(String(log.data || '')) ||
          !/^0x[0-9a-f]{64}$/i.test(String(log.transactionHash || '')) ||
          !/^0x[0-9a-f]+$/i.test(String(log.blockNumber || '')) ||
          !/^0x[0-9a-f]+$/i.test(String(log.logIndex || ''))
        ) continue;
        found += 1;
        const outcome = await creditDepositEvent(db, log, addressToUser, decimals, safeHead);
        if (outcome === 'credited') credited += 1;
      }
    }
    scannedTo = to;
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(stateRef);
      const current = BigInt(snap.data()?.lastScannedBlock || '0');
      if (scannedTo > current) transaction.set(stateRef, { lastScannedBlock: scannedTo.toString(), updatedAt: new Date().toISOString() }, { merge: true });
    });
  }

  return { configured: true, scannedTo: scannedTo.toString(), found, credited, addresses: addressToUser.size };
}
