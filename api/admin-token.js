import { randomUUID } from 'node:crypto';
import { getPool } from './_lib/db.js';
import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function requireAdmin(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const decoded = await verifyFirebaseIdToken(token);
  const email = String(decoded.email || '').trim().toLowerCase();
  const { rows } = await getPool().query('SELECT id,email,role,status FROM users WHERE id=$1 AND email=$2 LIMIT 1', [decoded.uid, email]);
  const admin = rows[0];
  if (!admin || admin.role !== 'admin' || admin.status !== 'active') throw new Error('ADMIN_REQUIRED');
  return admin;
}

async function tokenBalance(client, userId) {
  const { rows } = await client.query(`
    SELECT COALESCE(SUM(CASE WHEN flow='credit' THEN amount WHEN flow='debit' THEN -amount ELSE 0 END),0)::numeric AS balance
    FROM ledger_transactions
    WHERE user_id=$1 AND category='token' AND status='completed' AND type IN ('token_credit','token_debit')
  `, [userId]);
  return Number(rows[0]?.balance || 0);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  let client;
  try {
    const admin = await requireAdmin(req);
    const userId = String(req.body?.userId || '').trim();
    const flow = String(req.body?.flow || '');
    const amount = Number(req.body?.amount || 0);
    const reason = String(req.body?.reason || '').trim();
    if (!userId) return json(res, 400, { error: 'userId is required' });
    if (!['credit','debit'].includes(flow)) return json(res, 400, { error: 'Invalid token action' });
    if (!Number.isFinite(amount) || amount <= 0) return json(res, 400, { error: 'Token amount must be greater than zero' });
    if (!reason) return json(res, 400, { error: 'Reason is required for manual token changes' });

    client = await getPool().connect();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${userId}:gf-token`]);
    const userCheck = await client.query('SELECT id,email FROM users WHERE id=$1 LIMIT 1', [userId]);
    if (!userCheck.rows[0]) throw new Error('USER_NOT_FOUND');
    const before = await tokenBalance(client, userId);
    if (flow === 'debit' && before < amount) throw new Error('INSUFFICIENT_TOKEN');
    const id = randomUUID();
    const type = flow === 'credit' ? 'token_credit' : 'token_debit';
    const description = `${flow === 'credit' ? 'Manual token credit' : 'Manual token removal'}: ${reason}`;
    await client.query(`
      INSERT INTO ledger_transactions
      (id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata,created_at)
      VALUES ($1,$2,$3,'token',$4,$5,0,$5,$6,$1,'completed',$7::jsonb,NOW())
    `, [id, userId, type, flow, amount, description, JSON.stringify({ unit:'GF_TOKEN', reason, adminUserId:admin.id })]);
    await client.query(`INSERT INTO audit_logs (id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,timestamp)
      VALUES ($1,$2,$3,$4,'user',$5,$6::jsonb,NOW())`,
      [randomUUID(), admin.id, admin.email, flow === 'credit' ? 'Manual Token Credited' : 'Manual Token Removed', userId, JSON.stringify({ amount, reason, tokenTxnId:id })]);
    const after = flow === 'credit' ? before + amount : before - amount;
    await client.query('COMMIT');
    return json(res, 200, { success:true, tokenBalance:Number(after.toFixed(4)), transactionId:id });
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch {} }
    const msg = String(error?.message || '');
    if (msg === 'ADMIN_REQUIRED') return json(res, 403, { error: 'Admin access required' });
    if (msg === 'USER_NOT_FOUND') return json(res, 404, { error: 'User not found' });
    if (msg === 'INSUFFICIENT_TOKEN') return json(res, 400, { error: 'User does not have enough tokens to remove' });
    console.error('admin-token failed:', msg);
    return json(res, 500, { error: 'Token adjustment failed' });
  } finally {
    if (client) client.release();
  }
}
