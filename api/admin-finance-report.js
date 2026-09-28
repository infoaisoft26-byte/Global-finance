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
  const { rows } = await getPool().query('SELECT id,role,status FROM users WHERE id=$1 AND email=$2 LIMIT 1', [decoded.uid, email]);
  const user = rows[0];
  if (!user || user.role !== 'admin' || user.status !== 'active') throw new Error('ADMIN_REQUIRED');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    await requireAdmin(req);
    const pool = getPool();
    const [summaryQ, ledgerQ, purchasesQ, walletsQ] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN type='crypto_deposit' AND flow='credit' AND status='completed' THEN amount ELSE 0 END),0) AS total_deposits,
          COALESCE(SUM(CASE WHEN type='package_purchase' AND flow='debit' AND status='completed' THEN amount ELSE 0 END),0) AS total_package_purchases,
          COUNT(*) FILTER (WHERE type='crypto_deposit' AND status='completed')::int AS deposit_count,
          COUNT(*) FILTER (WHERE type='package_purchase' AND status='completed')::int AS purchase_count
        FROM ledger_transactions
      `),
      pool.query(`
        SELECT l.id,l.user_id,u.name,u.email,u.referral_code,l.type,l.category,l.flow,l.amount,l.fee,l.net_amount,l.description,l.reference_id,l.status,l.metadata,l.created_at
        FROM ledger_transactions l LEFT JOIN users u ON u.id=l.user_id
        ORDER BY l.created_at DESC LIMIT 1000
      `),
      pool.query(`
        SELECT p.id,p.user_id,u.name,u.email,u.referral_code,p.package_id,p.package_type,p.package_name,p.amount,p.roi_daily_rate,p.duration_days,p.total_earned,p.status,p.activated_at,p.expires_at
        FROM package_activations p LEFT JOIN users u ON u.id=p.user_id
        ORDER BY p.activated_at DESC LIMIT 1000
      `),
      pool.query(`
        SELECT w.user_id,u.name,u.email,u.referral_code,w.fund_wallet,w.income_wallet,w.total_income,w.total_withdrawal,w.basic_package_active,w.fd_package_active,w.updated_at
        FROM wallets w LEFT JOIN users u ON u.id=w.user_id
        ORDER BY w.updated_at DESC LIMIT 2000
      `)
    ]);

    const s = summaryQ.rows[0] || {};
    const walletTotals = walletsQ.rows.reduce((a, r) => {
      a.availableUsdt += Number(r.fund_wallet || 0);
      a.incomeWallet += Number(r.income_wallet || 0);
      a.activeBasic += Number(r.basic_package_active || 0);
      a.activeFd += Number(r.fd_package_active || 0);
      return a;
    }, { availableUsdt: 0, incomeWallet: 0, activeBasic: 0, activeFd: 0 });

    return json(res, 200, {
      generatedAt: new Date().toISOString(),
      summary: {
        totalDeposits: Number(s.total_deposits || 0),
        totalPackagePurchases: Number(s.total_package_purchases || 0),
        depositCount: Number(s.deposit_count || 0),
        purchaseCount: Number(s.purchase_count || 0),
        ...walletTotals,
      },
      ledger: ledgerQ.rows,
      purchases: purchasesQ.rows,
      wallets: walletsQ.rows,
    });
  } catch (error) {
    if (String(error?.message) === 'ADMIN_REQUIRED') return json(res, 403, { error: 'Admin access required' });
    console.error('admin-finance-report failed:', error instanceof Error ? error.message : error);
    return json(res, 500, { error: 'Unable to load finance report' });
  }
}
