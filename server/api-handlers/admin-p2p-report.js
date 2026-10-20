import { getPool } from '../../api/_lib/db.js';
import { verifyFirebaseIdToken } from '../../api/_lib/firebaseAdmin.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(body));
}

async function requireAdmin(req) {
  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) throw new Error('ADMIN_REQUIRED');
  const decoded = await verifyFirebaseIdToken(authorization.slice(7));
  const email = String(decoded.email || '').trim().toLowerCase();
  const result = await getPool().query(
    'SELECT id,role,status FROM users WHERE id=$1 AND email=$2 LIMIT 1',
    [decoded.uid, email]
  );
  const actor = result.rows[0];
  if (!actor || !['admin', 'sub_admin'].includes(actor.role) || actor.status !== 'active') {
    throw new Error('ADMIN_REQUIRED');
  }
  return actor;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    await requireAdmin(req);
    const pool = getPool();
    const [summaryResult, transfersResult, internalResult] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE d.status='completed')::int AS completed_count,
          COALESCE(SUM(d.amount) FILTER (WHERE d.status='completed'),0)::numeric AS completed_amount,
          COUNT(*) FILTER (WHERE d.status<>'completed')::int AS non_completed_count,
          COUNT(*) FILTER (WHERE (d.created_at AT TIME ZONE 'Asia/Kolkata')::date=(NOW() AT TIME ZONE 'Asia/Kolkata')::date AND d.status='completed')::int AS today_count,
          COALESCE(SUM(d.amount) FILTER (WHERE (d.created_at AT TIME ZONE 'Asia/Kolkata')::date=(NOW() AT TIME ZONE 'Asia/Kolkata')::date AND d.status='completed'),0)::numeric AS today_amount,
          COUNT(*) FILTER (WHERE c.id IS NULL OR c.status<>'completed' OR c.amount<>d.amount)::int AS reconciliation_issues
        FROM ledger_transactions d
        LEFT JOIN LATERAL (
          SELECT id,status,amount FROM ledger_transactions
          WHERE reference_id=d.reference_id AND type='p2p_transfer' AND flow='credit'
          ORDER BY created_at ASC LIMIT 1
        ) c ON TRUE
        WHERE d.type='p2p_transfer' AND d.flow='debit'
      `),
      pool.query(`
        SELECT d.id,d.reference_id,d.amount,d.fee,d.net_amount,d.status,d.description,d.created_at,
          d.metadata,
          sender.id AS sender_user_id,sender.name AS sender_name,sender.email AS sender_email,
          sender.referral_code AS sender_gf_id,
          recipient.id AS recipient_user_id,recipient.name AS recipient_name,recipient.email AS recipient_email,
          recipient.referral_code AS recipient_gf_id,
          c.id AS credit_ledger_id,c.amount AS credited_amount,c.status AS credit_status,c.created_at AS credited_at,
          CASE WHEN c.id IS NULL THEN 'missing_credit'
               WHEN c.status<>'completed' THEN 'credit_not_completed'
               WHEN c.amount<>d.amount THEN 'amount_mismatch'
               WHEN d.status<>'completed' THEN 'debit_not_completed'
               ELSE 'balanced' END AS reconciliation_status
        FROM ledger_transactions d
        LEFT JOIN users sender ON sender.id=d.user_id
        LEFT JOIN users recipient ON recipient.id=d.metadata->>'counterpartyUserId'
        LEFT JOIN LATERAL (
          SELECT id,amount,status,created_at FROM ledger_transactions
          WHERE reference_id=d.reference_id AND type='p2p_transfer' AND flow='credit'
          ORDER BY created_at ASC LIMIT 1
        ) c ON TRUE
        WHERE d.type='p2p_transfer' AND d.flow='debit'
        ORDER BY d.created_at DESC
        LIMIT 5000
      `),
      pool.query(`
        SELECT COUNT(*)::int AS transfer_count,
          COALESCE(SUM(amount),0)::numeric AS amount
        FROM ledger_transactions
        WHERE type='income_to_fund' AND flow='debit' AND status='completed'
      `)
    ]);
    const s = summaryResult.rows[0] || {};
    const i = internalResult.rows[0] || {};
    return json(res, 200, {
      generatedAt: new Date().toISOString(),
      summary: {
        completedCount: Number(s.completed_count || 0),
        completedAmount: Number(s.completed_amount || 0),
        nonCompletedCount: Number(s.non_completed_count || 0),
        todayCount: Number(s.today_count || 0),
        todayAmount: Number(s.today_amount || 0),
        reconciliationIssues: Number(s.reconciliation_issues || 0),
        incomeToFundCount: Number(i.transfer_count || 0),
        incomeToFundAmount: Number(i.amount || 0)
      },
      transfers: transfersResult.rows.map(row => ({
        id: row.id,
        reference: row.reference_id,
        amount: Number(row.amount || 0),
        fee: Number(row.fee || 0),
        netAmount: Number(row.net_amount || 0),
        status: row.status,
        description: row.description || '',
        note: row.metadata?.note || '',
        senderUserId: row.sender_user_id || row.user_id,
        senderName: row.sender_name || 'Unknown member',
        senderEmail: row.sender_email || '',
        senderGfId: row.sender_gf_id || row.metadata?.senderReferralCode || '',
        recipientUserId: row.recipient_user_id || row.metadata?.counterpartyUserId || '',
        recipientName: row.recipient_name || row.metadata?.counterpartyName || 'Unknown member',
        recipientEmail: row.recipient_email || '',
        recipientGfId: row.recipient_gf_id || row.metadata?.counterpartyCode || '',
        creditLedgerId: row.credit_ledger_id || '',
        creditedAmount: row.credited_amount == null ? null : Number(row.credited_amount),
        creditStatus: row.credit_status || 'missing',
        creditedAt: row.credited_at || null,
        reconciliationStatus: row.reconciliation_status || 'missing_credit',
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    if (String(error?.message || '') === 'ADMIN_REQUIRED') return json(res, 403, { error: 'Admin access required.' });
    console.error('admin-p2p-report failed:', error instanceof Error ? error.message : error);
    return json(res, 500, { error: 'Unable to load P2P accounting report.' });
  }
}
