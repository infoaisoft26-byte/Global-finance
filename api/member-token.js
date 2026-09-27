import { getPool } from './_lib/db.js';
import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const decoded = await verifyFirebaseIdToken(token);
    const email = String(decoded.email || '').trim().toLowerCase();
    const pool = getPool();
    const userResult = await pool.query('SELECT id,status FROM users WHERE id=$1 AND email=$2 LIMIT 1', [decoded.uid, email]);
    const member = userResult.rows[0];
    if (!member || member.status !== 'active') return json(res, 403, { error: 'Active member account required' });
    const { rows } = await pool.query(`
      SELECT id,type,flow,amount,description,created_at
      FROM ledger_transactions
      WHERE user_id=$1 AND category='token' AND status='completed' AND type IN ('token_credit','token_debit')
      ORDER BY created_at DESC
      LIMIT 20
    `, [member.id]);
    const balance = rows.reduce((sum, r) => sum + (r.flow === 'credit' ? Number(r.amount || 0) : -Number(r.amount || 0)), 0);
    return json(res, 200, {
      tokenBalance: Number(balance.toFixed(4)),
      unit: 'GF_TOKEN',
      history: rows.map(r => ({ id:r.id, type:r.type, flow:r.flow, amount:Number(r.amount||0), description:r.description||'', createdAt:r.created_at }))
    });
  } catch (error) {
    console.error('member-token failed:', error instanceof Error ? error.message : error);
    return json(res, 401, { error: 'Unable to load token balance' });
  }
}
