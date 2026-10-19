import { verifyFirebaseIdToken } from '../../api/_lib/firebaseAdmin.js';
import { getPool } from '../../api/_lib/db.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

const INCOME_TYPES = [
  'basic_roi','fd_roi','basic_level','fd_level','rd_level',
  'basic_referral','fd_referral','referral_bonus','level_bonus','salary',
  'joining_bonus','retopup_bonus'
];

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const authorization = String(req.headers.authorization || '');
    if (!authorization.startsWith('Bearer ')) return json(res, 401, { error: 'Authentication required' });
    const decoded = await verifyFirebaseIdToken(authorization.slice(7));
    const uid = String(decoded.uid || '');
    if (!uid) return json(res, 401, { error: 'Authentication required' });

    const pool = getPool();
    const memberQ = await pool.query(
      'SELECT id, role, status FROM users WHERE id=$1 LIMIT 1',
      [uid]
    );
    const member = memberQ.rows[0];
    if (!member || member.status !== 'active') return json(res, 403, { error: 'Active member account required' });

    const report = String(req.query?.report || 'income');
    const n = v => Number(v || 0);

    if (report === 'daily' || report === 'monthly') {
      const dateExpr = report === 'daily'
        ? "(l.created_at AT TIME ZONE 'Asia/Kolkata')::date::text"
        : "to_char(l.created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM')";
      const labelExpr = report === 'daily'
        ? "to_char((l.created_at AT TIME ZONE 'Asia/Kolkata')::date,'DD Mon YYYY')"
        : "to_char(l.created_at AT TIME ZONE 'Asia/Kolkata','Mon YYYY')";
      const result = await pool.query(
        `SELECT ${dateExpr} AS period_key, ${labelExpr} AS period_label,
          COALESCE(SUM(CASE WHEN l.type IN ('basic_roi','fd_roi') THEN l.amount ELSE 0 END),0) AS roi_income,
          COALESCE(SUM(CASE WHEN l.type IN ('basic_level','fd_level','rd_level','level_bonus') THEN l.amount ELSE 0 END),0) AS level_income,
          COALESCE(SUM(CASE WHEN l.type IN ('basic_referral','fd_referral','referral_bonus','joining_bonus','retopup_bonus') THEN l.amount ELSE 0 END),0) AS referral_income,
          COALESCE(SUM(CASE WHEN l.type='salary' THEN l.amount ELSE 0 END),0) AS salary_income,
          COALESCE(SUM(l.amount),0) AS total_income,
          COUNT(*)::int AS entry_count
         FROM ledger_transactions l
         WHERE l.user_id=$1 AND l.category='income_wallet' AND l.flow='credit'
           AND l.status='completed' AND l.type = ANY($2::text[])
         GROUP BY period_key,period_label
         ORDER BY period_key DESC`,
        [uid, INCOME_TYPES]
      );
      const totalsQ = await pool.query(
        `SELECT COALESCE(SUM(amount),0) AS total_income, COUNT(*)::int AS entry_count
         FROM ledger_transactions WHERE user_id=$1 AND category='income_wallet' AND flow='credit'
           AND status='completed' AND type=ANY($2::text[])`,
        [uid, INCOME_TYPES]
      );
      return json(res, 200, {
        report, generatedAt: new Date().toISOString(),
        summary: { totalIncome: n(totalsQ.rows[0]?.total_income), entryCount: n(totalsQ.rows[0]?.entry_count) },
        rows: result.rows.map(r => ({
          id: r.period_key, periodKey: r.period_key, period: r.period_label,
          roiIncome: n(r.roi_income), levelIncome: n(r.level_income),
          referralIncome: n(r.referral_income), salaryIncome: n(r.salary_income),
          totalIncome: n(r.total_income), entryCount: n(r.entry_count)
        }))
      });
    }

    if (report !== 'fund' && report !== 'income') return json(res, 400, { error: 'Invalid report type' });
    const category = report === 'fund' ? 'fund_wallet' : 'income_wallet';
    const [walletQ, totalsQ, rowsQ] = await Promise.all([
      pool.query('SELECT fund_wallet,income_wallet,total_income,total_withdrawal FROM wallets WHERE user_id=$1 LIMIT 1', [uid]),
      pool.query(
        `SELECT
          COALESCE(SUM(CASE WHEN flow='credit' AND status='completed' THEN amount ELSE 0 END),0) AS total_credits,
          COALESCE(SUM(CASE WHEN flow='debit' AND status='completed' THEN amount ELSE 0 END),0) AS total_debits,
          COUNT(*) FILTER (WHERE status='completed')::int AS entry_count
         FROM ledger_transactions WHERE user_id=$1 AND category=$2`,
        [uid, category]
      ),
      pool.query(
        `SELECT id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata,created_at
         FROM ledger_transactions WHERE user_id=$1 AND category=$2
         ORDER BY created_at DESC LIMIT 2000`,
        [uid, category]
      )
    ]);
    const w = walletQ.rows[0] || {};
    const t = totalsQ.rows[0] || {};
    return json(res, 200, {
      report, generatedAt: new Date().toISOString(),
      summary: {
        availableBalance: n(report === 'fund' ? w.fund_wallet : w.income_wallet),
        totalCredits: n(t.total_credits), totalDebits: n(t.total_debits),
        entryCount: n(t.entry_count), lifetimeIncome: n(w.total_income),
        totalWithdrawal: n(w.total_withdrawal)
      },
      rows: rowsQ.rows.map(r => ({
        id: r.id, userId: r.user_id, type: r.type, category: r.category, flow: r.flow,
        amount: n(r.amount), fee: n(r.fee), netAmount: n(r.net_amount),
        description: r.description || '', referenceId: r.reference_id || '',
        status: r.status, metadata: r.metadata || {},
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null
      }))
    });
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('Firebase') || message.includes('token')) return json(res, 401, { error: 'Authentication required' });
    console.error('member-finance-report failed:', message);
    return json(res, 503, { error: 'Finance report is temporarily unavailable' });
  }
}
