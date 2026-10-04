import { getPool } from './_lib/db.js';
import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(body));
}

function mapRow(row) {
  const rawType = String(row.type || '');
  return {
    id: row.id,
    userId: row.user_id,
    type: rawType === 'usdt_bep20_recharge' ? 'recharge' : rawType,
    category: row.category,
    flow: row.flow,
    amount: Number(row.amount || 0),
    fee: Number(row.fee || 0),
    netAmount: Number(row.net_amount || 0),
    description: row.description || '',
    referenceId: row.reference_id || row.id,
    status: row.status || 'completed',
    metadata: row.metadata || undefined,
    createdAt: row.created_at?.toISOString?.() || String(row.created_at),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  try {
    const auth = String(req.headers.authorization || '');
    if (!auth.startsWith('Bearer ')) return json(res, 401, { error: 'Authentication required' });

    const decoded = await verifyFirebaseIdToken(auth.slice(7));
    const userId = String(decoded.uid || '');
    if (!userId) return json(res, 401, { error: 'Invalid authentication' });

    const { rows } = await getPool().query(
      `SELECT id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata,created_at
       FROM ledger_transactions
       WHERE user_id=$1
       ORDER BY created_at DESC
       LIMIT 200`,
      [userId]
    );

    return json(res, 200, { transactions: rows.map(mapRow) });
  } catch (error) {
    console.error('financial-ledger failed:', error instanceof Error ? error.message : error);
    return json(res, 500, { error: 'Unable to load financial ledger' });
  }
}
