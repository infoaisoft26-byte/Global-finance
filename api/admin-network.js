import { getPool } from './_lib/db.js';
import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function requireAdmin(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const decoded = await verifyFirebaseIdToken(token);
  const email = String(decoded.email || '').trim().toLowerCase();
  const { rows } = await getPool().query('SELECT id, role, status FROM users WHERE id=$1 AND email=$2 LIMIT 1', [decoded.uid, email]);
  const user = rows[0];
  if (!user || user.role !== 'admin' || user.status !== 'active') throw new Error('ADMIN_REQUIRED');
  return decoded;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    await requireAdmin(req);
    const pool = getPool();
    const { rows } = await pool.query(`
      WITH RECURSIVE network AS (
        SELECT u.id, u.email, u.name, u.phone, u.referral_code, u.sponsor_id, u.role, u.status, u.kyc_status,
               u.created_at, 0::int AS level, NULL::varchar AS root_referral
        FROM users u
        UNION ALL
        SELECT c.id, c.email, c.name, c.phone, c.referral_code, c.sponsor_id, c.role, c.status, c.kyc_status,
               c.created_at, n.level + 1, COALESCE(n.root_referral, n.referral_code)
        FROM users c
        JOIN network n ON c.sponsor_id = n.referral_code
        WHERE n.level < 20
      ),
      direct_counts AS (
        SELECT sponsor_id, COUNT(*)::int AS direct_count FROM users WHERE sponsor_id IS NOT NULL GROUP BY sponsor_id
      ),
      pkg AS (
        SELECT user_id,
               COALESCE(SUM(amount) FILTER (WHERE status='active'),0)::numeric AS active_package_amount,
               COUNT(*) FILTER (WHERE status='active')::int AS active_package_count,
               COALESCE(MAX(package_name) FILTER (WHERE status='active'),'') AS latest_package_name
        FROM package_activations GROUP BY user_id
      ),
      inc AS (
        SELECT user_id,
          COALESCE(SUM(net_amount) FILTER (WHERE flow='credit' AND status='completed' AND type IN ('referral_bonus','referral_income','direct_referral')),0)::numeric AS referral_income,
          COALESCE(SUM(net_amount) FILTER (WHERE flow='credit' AND status='completed' AND type IN ('level_bonus','level_income')),0)::numeric AS level_income,
          COALESCE(SUM(net_amount) FILTER (WHERE flow='credit' AND status='completed'),0)::numeric AS total_credited
        FROM ledger_transactions GROUP BY user_id
      )
      SELECT u.id, u.email, u.name, u.phone, u.referral_code, u.sponsor_id, u.role, u.status, u.kyc_status, u.created_at,
             COALESCE(w.fund_wallet,0) AS fund_wallet, COALESCE(w.income_wallet,0) AS income_wallet,
             COALESCE(dc.direct_count,0) AS direct_count,
             COALESCE(pkg.active_package_amount,0) AS active_package_amount,
             COALESCE(pkg.active_package_count,0) AS active_package_count,
             COALESCE(pkg.latest_package_name,'') AS latest_package_name,
             COALESCE(inc.referral_income,0) AS referral_income,
             COALESCE(inc.level_income,0) AS level_income,
             COALESCE(inc.total_credited,0) AS total_credited
      FROM users u
      LEFT JOIN wallets w ON w.user_id=u.id
      LEFT JOIN direct_counts dc ON dc.sponsor_id=u.referral_code
      LEFT JOIN pkg ON pkg.user_id=u.id
      LEFT JOIN inc ON inc.user_id=u.id
      ORDER BY u.created_at DESC
      LIMIT 2000
    `);

    const bySponsor = new Map();
    for (const r of rows) {
      if (!r.sponsor_id) continue;
      if (!bySponsor.has(r.sponsor_id)) bySponsor.set(r.sponsor_id, []);
      bySponsor.get(r.sponsor_id).push(r);
    }
    const descendants = (ref) => {
      const seen = new Set();
      const q = [...(bySponsor.get(ref) || [])];
      while (q.length) {
        const x = q.shift();
        if (!x || seen.has(x.id)) continue;
        seen.add(x.id);
        q.push(...(bySponsor.get(x.referral_code) || []));
      }
      return seen.size;
    };

    const members = rows.map(r => ({
      id: r.id, name: r.name, email: r.email, phone: r.phone || '', referralCode: r.referral_code,
      sponsorId: r.sponsor_id || '', role: r.role, status: r.status, kycStatus: r.kyc_status,
      createdAt: r.created_at, directCount: Number(r.direct_count || 0), totalDownline: descendants(r.referral_code),
      fundWallet: Number(r.fund_wallet || 0), incomeWallet: Number(r.income_wallet || 0),
      activePackageAmount: Number(r.active_package_amount || 0), activePackageCount: Number(r.active_package_count || 0),
      latestPackageName: r.latest_package_name || '', referralIncome: Number(r.referral_income || 0),
      levelIncome: Number(r.level_income || 0), totalCredited: Number(r.total_credited || 0)
    }));

    const summary = {
      totalMembers: members.filter(m => m.role === 'user').length,
      totalDirectLinks: members.filter(m => !!m.sponsorId).length,
      totalActivePackageAmount: members.reduce((s,m) => s + m.activePackageAmount, 0),
      totalReferralIncome: members.reduce((s,m) => s + m.referralIncome, 0),
      totalLevelIncome: members.reduce((s,m) => s + m.levelIncome, 0)
    };
    return json(res, 200, { summary, members });
  } catch (error) {
    if (String(error?.message) === 'ADMIN_REQUIRED') return json(res, 403, { error: 'Admin access required' });
    console.error('admin-network failed:', error instanceof Error ? error.message : error);
    return json(res, 500, { error: 'Unable to load referral network' });
  }
}
