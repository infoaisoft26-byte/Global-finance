import crypto from 'node:crypto';
import { getPool, withTransaction } from './_lib/db.js';
import { readCookie, verifySessionToken } from './_lib/session.js';
import { fetchConfirmedTrc20Transfers, getTronTestnetConfig, isMatchingConfirmedTransfer } from './_lib/tronTestnet.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(body));
}

async function requireUser(req) {
  const token = readCookie(req, 'gf_session');
  if (!token) throw new Error('UNAUTHORIZED');
  return verifySessionToken(token);
}

async function creditIntent(intent, tx, config) {
  return withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT * FROM crypto_deposit_intents WHERE id=$1 AND user_id=$2 FOR UPDATE`,
      [intent.id, intent.user_id]
    );
    const current = locked.rows[0];
    if (!current || current.status !== 'pending') return { credited: false, alreadyProcessed: true };

    const duplicate = await client.query(
      `SELECT id FROM crypto_deposit_intents WHERE txid=$1 LIMIT 1`,
      [tx.transaction_id]
    );
    if (duplicate.rows[0]) return { credited: false, duplicate: true };

    const ledgerId = `TST_${crypto.randomUUID().replaceAll('-', '').slice(0, 26)}`;
    const amountInr = Number(current.requested_amount_inr);

    await client.query(
      `UPDATE wallets
       SET fund_wallet = fund_wallet + $1, updated_at = NOW()
       WHERE user_id=$2`,
      [amountInr, current.user_id]
    );

    await client.query(
      `INSERT INTO ledger_transactions
       (id, user_id, type, category, flow, amount, fee, net_amount, description,
        reference_id, status, metadata)
       VALUES ($1,$2,'testnet_crypto_deposit','fund_wallet','credit',$3,0,$3,$4,$5,'completed',$6::jsonb)`,
      [
        ledgerId,
        current.user_id,
        amountInr,
        'Shasta USDT test deposit credited',
        tx.transaction_id,
        JSON.stringify({
          testnet: true,
          network: 'SHASTA',
          token: 'USDT-TEST',
          tokenContract: config.contractAddress,
          depositAddress: config.depositAddress,
          expectedAmountUsdt: Number(current.expected_amount_usdt),
          senderAddress: tx.from,
          txid: tx.transaction_id,
          blockTimestamp: tx.block_timestamp,
        }),
      ]
    );

    await client.query(
      `UPDATE crypto_deposit_intents
       SET status='credited', txid=$1, sender_address=$2, block_timestamp=$3,
           credited_at=NOW(), updated_at=NOW()
       WHERE id=$4`,
      [tx.transaction_id, tx.from || null, Number(tx.block_timestamp || 0), current.id]
    );

    await client.query(
      `INSERT INTO audit_logs
       (id, actor_user_id, actor_email, action, entity_type, entity_id, metadata)
       VALUES ($1,$2,$3,'testnet_crypto_deposit_credited','crypto_deposit_intent',$4,$5::jsonb)`,
      [
        `AUD_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`,
        current.user_id,
        null,
        current.id,
        JSON.stringify({ testnet: true, txid: tx.transaction_id, amountInr }),
      ]
    );

    const wallet = await client.query(
      `SELECT fund_wallet, income_wallet FROM wallets WHERE user_id=$1 LIMIT 1`,
      [current.user_id]
    );

    return {
      credited: true,
      intentId: current.id,
      txid: tx.transaction_id,
      fundWallet: Number(wallet.rows[0]?.fund_wallet || 0),
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const session = await requireUser(req);
    const config = getTronTestnetConfig();
    const pool = getPool();

    await pool.query(
      `UPDATE crypto_deposit_intents
       SET status='expired', updated_at=NOW()
       WHERE user_id=$1 AND status='pending' AND expires_at <= NOW()`,
      [session.uid]
    );

    const { rows: intents } = await pool.query(
      `SELECT * FROM crypto_deposit_intents
       WHERE user_id=$1 AND status='pending' AND expires_at > NOW()
       ORDER BY created_at ASC
       LIMIT 5`,
      [session.uid]
    );

    if (!intents.length) {
      return json(res, 200, { success: true, testnet: true, credited: false, message: 'No pending Shasta deposits.' });
    }

    const minTimestamp = Math.min(...intents.map((i) => new Date(i.created_at).getTime())) - 60_000;
    const transfers = await fetchConfirmedTrc20Transfers({
      address: config.depositAddress,
      minTimestamp,
    });

    for (const intent of intents) {
      const match = transfers.find((tx) => isMatchingConfirmedTransfer(tx, intent, config));
      if (!match) continue;
      const result = await creditIntent(intent, match, config);
      if (result.credited) {
        return json(res, 200, { success: true, testnet: true, ...result });
      }
    }

    return json(res, 200, {
      success: true,
      testnet: true,
      credited: false,
      pending: intents.length,
      message: 'No matching confirmed Shasta transfer yet.',
    });
  } catch (error) {
    if (error?.message === 'UNAUTHORIZED') return json(res, 401, { error: 'Authentication required.' });
    console.error('crypto-deposit-sync:', error);
    return json(res, 500, { error: error instanceof Error ? error.message : 'Testnet reconciliation failed.' });
  }
}
