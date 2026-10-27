import { getPool } from '../../api/_lib/db.js';
import { verifyFirebaseIdToken } from '../../api/_lib/firebaseAdmin.js';

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
  const { rows } = await getPool().query(
    'SELECT id,role,status FROM users WHERE id=$1 AND email=$2 LIMIT 1',
    [decoded.uid, email]
  );
  const user = rows[0];
  if (!user || !['admin','sub_admin'].includes(user.role) || user.status !== 'active') {
    throw new Error('ADMIN_REQUIRED');
  }
  return user;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    await requireAdmin(req);
    const pool = getPool();
    const [investmentsQ, levelsQ, usersQ] = await Promise.all([
      pool.query(`
        SELECT user_id,
          COALESCE(SUM(amount) FILTER (
            WHERE type='package_purchase' AND flow='debit' AND status='completed'
          ),0)::numeric AS total_invested,
          COUNT(*) FILTER (
            WHERE type='package_purchase' AND flow='debit' AND status='completed'
          )::int AS investment_count,
          MAX(created_at) FILTER (
            WHERE type='package_purchase' AND flow='debit' AND status='completed'
          ) AS last_investment_at
        FROM ledger_transactions
        GROUP BY user_id
      `),
      pool.query(`
        WITH eligible AS (
          SELECT l.user_id,
            CASE WHEN COALESCE(
              NULLIF(l.metadata->>'level',''),
              NULLIF(l.metadata->>'levelNumber',''),
              NULLIF(l.metadata->>'level_number',''),
              NULLIF(l.metadata->>'commissionLevel','')
            ) ~ '^[0-9]{1,2}$'
            THEN COALESCE(
              NULLIF(l.metadata->>'level',''),
              NULLIF(l.metadata->>'levelNumber',''),
              NULLIF(l.metadata->>'level_number',''),
              NULLIF(l.metadata->>'commissionLevel','')
            )::int ELSE 0 END AS level_no,
            COALESCE(NULLIF(l.net_amount,0),l.amount) AS credit_amount,
            l.created_at
          FROM ledger_transactions l
          WHERE l.flow='credit'
            AND l.category='income_wallet'
            AND l.status IN ('completed','approved','credited')
            AND l.type IN (
              'level_bonus','level_income','basic_level','fd_level','rd_level',
              'basic_joining_level','fd_joining_level',
              'basic_retopup_level','fd_retopup_level'
            )
        )
        SELECT user_id,level_no AS level,COUNT(*)::int AS credit_count,
          COALESCE(SUM(credit_amount),0)::numeric AS total_income,
          MAX(created_at) AS last_credit_at
        FROM eligible
        GROUP BY user_id,level_no
      `),
      pool.query(`
        SELECT id,name,email,referral_code,status
        FROM users
        WHERE role='user' AND COALESCE(status,'')<>'deleted'
      `)
    ]);

    const investments = new Map(investmentsQ.rows.map(r => [r.user_id, r]));
    const byUser = new Map();
    const levelTotals = Array.from({ length: 15 }, (_, i) => ({
      level: i + 1, totalIncome: 0, creditCount: 0, memberIds: new Set()
    }));
    let unassignedIncome = 0;

    for (const r of levelsQ.rows) {
      const level = Number(r.level || 0);
      const totalIncome = Number(r.total_income || 0);
      const memberLevel = {
        level,
        creditCount: Number(r.credit_count || 0),
        totalIncome,
        lastCreditAt: r.last_credit_at
      };
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
      byUser.get(r.user_id).push(memberLevel);
      if (level >= 1 && level <= 15) {
        const bucket = levelTotals[level - 1];
        bucket.totalIncome += totalIncome;
        bucket.creditCount += memberLevel.creditCount;
        bucket.memberIds.add(r.user_id);
      } else {
        unassignedIncome += totalIncome;
      }
    }

    const members = usersQ.rows.map(u => {
      const investment = investments.get(u.id) || {};
      const memberLevels = (byUser.get(u.id) || [])
        .filter(x => x.level >= 1 && x.level <= 15)
        .sort((a, b) => a.level - b.level);
      return {
        userId: u.id,
        name: u.name || 'Member',
        email: u.email || '',
        gfId: u.referral_code || '',
        status: u.status || '',
        totalInvested: Number(investment.total_invested || 0),
        investmentCount: Number(investment.investment_count || 0),
        lastInvestmentAt: investment.last_investment_at || null,
        levels: memberLevels,
        levelIncomeTotal: memberLevels.reduce((sum, x) => sum + x.totalIncome, 0)
      };
    }).sort((a, b) => b.totalInvested - a.totalInvested || a.name.localeCompare(b.name));

    const levels = levelTotals.map(x => ({
      level: x.level,
      totalIncome: x.totalIncome,
      creditCount: x.creditCount,
      memberCount: x.memberIds.size
    }));
    return json(res, 200, {
      generatedAt: new Date().toISOString(),
      summary: {
        totalInvested: members.reduce((sum, m) => sum + m.totalInvested, 0),
        investmentCount: members.reduce((sum, m) => sum + m.investmentCount, 0),
        investedMembers: members.filter(m => m.totalInvested > 0).length,
        totalLevelIncome: levels.reduce((sum, x) => sum + x.totalIncome, 0),
        totalCredits: levels.reduce((sum, x) => sum + x.creditCount, 0),
        creditedMembers: new Set(levelsQ.rows.filter(r => Number(r.level) >= 1 && Number(r.level) <= 15).map(r => r.user_id)).size,
        unassignedIncome
      },
      levels,
      members
    });
  } catch (error) {
    if (String(error?.message) === 'ADMIN_REQUIRED') return json(res, 403, { error: 'Admin access required' });
    console.error('admin-income-leaderboard failed:', error instanceof Error ? error.message : error);
    return json(res, 500, { error: 'Unable to load investment leaderboard' });
  }
}
