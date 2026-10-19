import { randomUUID } from 'node:crypto';
import { getPool, withTransaction } from '../../api/_lib/db.js';
import { verifyFirebaseIdToken } from '../../api/_lib/firebaseAdmin.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(body));
}

async function actorFromRequest(req) {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) throw new Error('AUTH_REQUIRED');
  const decoded = await verifyFirebaseIdToken(auth.slice(7));
  const email = String(decoded.email || '').trim().toLowerCase();
  const result = await getPool().query(
    'SELECT id,email,name,referral_code,status,role FROM users WHERE id=$1 AND email=$2 LIMIT 1',
    [decoded.uid, email]
  );
  const actor = result.rows[0];
  if (!actor || actor.status !== 'active' || actor.role !== 'user') throw new Error('ACTIVE_MEMBER_REQUIRED');
  return actor;
}

async function settings(client) {
  const result = await client.query(
    'SELECT data FROM app_settings WHERE id=$1 LIMIT 1',
    ['global_finance_system_settings']
  ).catch(() => ({ rows: [] }));
  const data = result.rows?.[0]?.data || {};
  return {
    min: Number.isFinite(Number(data.minIncomeTransfer)) && Number(data.minIncomeTransfer) > 0
      ? Number(data.minIncomeTransfer) : 100,
    max: Number.isFinite(Number(data.maxIncomeTransfer)) && Number(data.maxIncomeTransfer) > 0
      ? Number(data.maxIncomeTransfer) : 200000,
  };
}

function mapHistory(row) {
  const amount = Number(row.amount || 0);
  return {
    id: row.id,
    reference: row.reference_id,
    requestType: 'income_to_fund',
    sourceWalletType: 'income_wallet',
    destinationWalletType: 'fund_wallet',
    amountRupees: amount,
    amountPaise: Math.round(amount * 100),
    feeRupees: 0,
    feePaise: 0,
    netAmountRupees: amount,
    netAmountPaise: Math.round(amount * 100),
    status: 'completed',
    createdAt: row.created_at,
    updatedAt: row.created_at,
    completedAt: row.created_at,
  };
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
  try {
    const actor = await actorFromRequest(req);
    if (req.method === 'GET') {
      const history = await getPool().query(
        `SELECT id,reference_id,amount,created_at
           FROM ledger_transactions
          WHERE user_id=$1 AND type='income_to_fund'
            AND category='income_wallet' AND flow='debit' AND status='completed'
          ORDER BY created_at DESC LIMIT 100`,
        [actor.id]
      );
      return json(res, 200, { history: history.rows.map(mapHistory) });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const amountText = String(body.amount ?? '').trim();
    if (!/^(?:0|[1-9][0-9]{0,12})(?:\.[0-9]{1,8})?$/.test(amountText)) {
      return json(res, 400, { error: 'Enter a valid USDT amount with up to 8 decimal places.' });
    }
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount <= 0) return json(res, 400, { error: 'Transfer amount must be greater than zero.' });
    const requestId = String(body.requestId || '').trim();
    if (!/^[a-zA-Z0-9_-]{12,100}$/.test(requestId)) return json(res, 400, { error: 'Invalid transfer request ID. Refresh and try again.' });

    const result = await withTransaction(async client => {
      // A stable request ID makes retrying after a network timeout idempotent.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [requestId]);
      const existing = await client.query(
        `SELECT id,reference_id,amount FROM ledger_transactions
          WHERE reference_id=$1 AND type='income_to_fund' AND flow='debit' LIMIT 1`,
        [requestId]
      );
      if (existing.rows.length) {
        const row = existing.rows[0];
        const wallet = await client.query('SELECT income_wallet,fund_wallet FROM wallets WHERE user_id=$1', [actor.id]);
        return {
          reference: row.reference_id,
          amount: Number(row.amount),
          incomeWallet: Number(wallet.rows[0]?.income_wallet || 0),
          fundWallet: Number(wallet.rows[0]?.fund_wallet || 0),
          repeated: true,
        };
      }

      const limits = await settings(client);
      if (amount < limits.min) throw new Error('BELOW_MINIMUM');
      if (amount > limits.max) throw new Error('ABOVE_MAXIMUM');

      await client.query('INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING', [actor.id]);
      const walletResult = await client.query(
        'SELECT income_wallet,fund_wallet FROM wallets WHERE user_id=$1 FOR UPDATE',
        [actor.id]
      );
      const wallet = walletResult.rows[0];
      const available = Number(wallet?.income_wallet || 0);
      if (!wallet || available + 0.000000001 < amount) {
        const error = new Error('INSUFFICIENT_FUNDS');
        error.available = available;
        throw error;
      }

      const reference = requestId;
      const debitId = 'WTD_' + randomUUID().replaceAll('-', '').slice(0, 24);
      const creditId = 'WTC_' + randomUUID().replaceAll('-', '').slice(0, 24);
      const meta = JSON.stringify({ asset: 'USDT', sourceWallet: 'income_wallet', destinationWallet: 'fund_wallet', internalTransfer: true });
      await client.query(
        `INSERT INTO ledger_transactions
          (id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata)
         VALUES
          ($1,$2,'income_to_fund','income_wallet','debit',$3,0,$3,$4,$5,'completed',$6::jsonb),
          ($7,$2,'income_to_fund','fund_wallet','credit',$3,0,$3,$8,$5,'completed',$6::jsonb)`,
        [debitId, actor.id, amount, `Internal USDT transfer from Available Balance`, reference, meta,
         creditId, `Internal USDT transfer to Fund Wallet`]
      );
      await client.query(
        'UPDATE wallets SET income_wallet=income_wallet-$1,fund_wallet=fund_wallet+$1,updated_at=NOW() WHERE user_id=$2',
        [amount, actor.id]
      );
      await client.query(
        `INSERT INTO audit_logs(id,actor_user_id,actor_email,action,entity_type,entity_id,metadata)
         VALUES($1,$2,$3,'INTERNAL_WALLET_TRANSFER_COMPLETED','ledger',$4,$5::jsonb)`,
        [randomUUID(), actor.id, actor.email, reference, JSON.stringify({ amountUsdt: amount, asset: 'USDT', debitId, creditId })]
      );
      const updated = await client.query('SELECT income_wallet,fund_wallet FROM wallets WHERE user_id=$1', [actor.id]);
      return {
        reference,
        amount,
        incomeWallet: Number(updated.rows[0]?.income_wallet || 0),
        fundWallet: Number(updated.rows[0]?.fund_wallet || 0),
        repeated: false,
      };
    });

    return json(res, 200, {
      success: true,
      reference: result.reference,
      amount: result.amount,
      asset: 'USDT',
      incomeWallet: result.incomeWallet,
      fundWallet: result.fundWallet,
      message: result.repeated
        ? 'This transfer was already completed. Wallet balances are up to date.'
        : `${result.amount.toFixed(8)} USDT transferred to Fund Wallet successfully. Reference: ${result.reference}`,
    });
  } catch (error) {
    const message = String(error?.message || '');
    if (message === 'AUTH_REQUIRED') return json(res, 401, { error: 'Authentication required.' });
    if (message === 'ACTIVE_MEMBER_REQUIRED') return json(res, 403, { error: 'Active member account required.' });
    if (message === 'BELOW_MINIMUM') return json(res, 400, { error: 'Transfer amount is below the configured minimum.' });
    if (message === 'ABOVE_MAXIMUM') return json(res, 400, { error: 'Transfer amount exceeds the configured maximum.' });
    if (message === 'INSUFFICIENT_FUNDS') return json(res, 409, { error: `Insufficient Available USDT. Server-verified available balance: ${Number(error.available || 0).toFixed(8)} USDT.` });
    console.error('internal-wallet-transfer failed:', message);
    return json(res, 500, { error: 'Internal wallet transfer could not be processed. No transfer was confirmed; refresh balances before retrying.' });
  }
}
