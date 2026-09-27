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
  const { rows } = await getPool().query(
    'SELECT id, email, role, status FROM users WHERE id=$1 AND email=$2 LIMIT 1',
    [decoded.uid, email]
  );
  const admin = rows[0];
  if (!admin || admin.role !== 'admin' || admin.status !== 'active') throw new Error('ADMIN_REQUIRED');
  return admin;
}

async function loadUser(pool, userId) {
  const [userResult, packageResult, txnResult, kycResult] = await Promise.all([
    pool.query(`
      SELECT u.id,u.email,u.name,u.phone,u.referral_code,u.sponsor_id,u.role,u.status,u.kyc_status,u.created_at,u.updated_at,
             COALESCE(w.fund_wallet,0) AS fund_wallet,
             COALESCE(w.income_wallet,0) AS income_wallet,
             COALESCE(w.total_income,0) AS total_income,
             COALESCE(w.total_withdrawal,0) AS total_withdrawal,
             COALESCE(w.basic_package_active,0) AS basic_package_active,
             COALESCE(w.fd_package_active,0) AS fd_package_active,
             COALESCE(w.direct_team_count,0) AS direct_team_count,
             COALESCE(w.total_team_count,0) AS total_team_count
      FROM users u
      LEFT JOIN wallets w ON w.user_id=u.id
      WHERE u.id=$1
      LIMIT 1
    `, [userId]),
    pool.query(`
      SELECT id,package_id,package_type,package_name,amount,roi_daily_rate,duration_days,total_earned,status,activated_at,expires_at
      FROM package_activations
      WHERE user_id=$1
      ORDER BY activated_at DESC NULLS LAST
      LIMIT 100
    `, [userId]),
    pool.query(`
      SELECT id,type,category,flow,amount,fee,net_amount,description,reference_id,status,created_at
      FROM ledger_transactions
      WHERE user_id=$1
      ORDER BY created_at DESC
      LIMIT 50
    `, [userId]),
    pool.query(`
      SELECT id,legal_name,document_type,document_last4,status,admin_notes,reviewed_by,reviewed_at,created_at,updated_at
      FROM kyc_submissions
      WHERE user_id=$1
      ORDER BY created_at DESC
      LIMIT 10
    `, [userId])
  ]);

  const u = userResult.rows[0];
  if (!u) return null;

  const transactions = txnResult.rows.map(t => ({
    id: t.id,
    type: t.type,
    category: t.category,
    flow: t.flow,
    amount: Number(t.amount || 0),
    fee: Number(t.fee || 0),
    netAmount: Number(t.net_amount || 0),
    description: t.description || '',
    referenceId: t.reference_id || '',
    status: t.status,
    createdAt: t.created_at
  }));

  const ledger = transactions.reduce((acc, t) => {
    if (t.status !== 'completed') return acc;
    if (t.flow === 'credit') acc.totalCredits += t.netAmount || t.amount;
    if (t.flow === 'debit') acc.totalDebits += t.amount;
    return acc;
  }, { totalCredits: 0, totalDebits: 0 });

  return {
    profile: {
      id: u.id,
      uid: u.id,
      email: u.email,
      name: u.name || 'Member',
      phone: u.phone || '',
      referralCode: u.referral_code || '',
      sponsorId: u.sponsor_id || '',
      role: u.role,
      status: u.status,
      kycStatus: u.kyc_status,
      createdAt: u.created_at,
      updatedAt: u.updated_at
    },
    wallet: {
      fundWallet: Number(u.fund_wallet || 0),
      incomeWallet: Number(u.income_wallet || 0),
      totalIncome: Number(u.total_income || 0),
      totalWithdrawal: Number(u.total_withdrawal || 0),
      basicPackageActive: Number(u.basic_package_active || 0),
      fdPackageActive: Number(u.fd_package_active || 0),
      directTeamCount: Number(u.direct_team_count || 0),
      totalTeamCount: Number(u.total_team_count || 0)
    },
    ledger: {
      totalCredits: Number(ledger.totalCredits.toFixed(2)),
      totalDebits: Number(ledger.totalDebits.toFixed(2)),
      entryCount: transactions.length
    },
    packages: packageResult.rows.map(p => ({
      id: p.id,
      packageId: p.package_id,
      packageType: p.package_type,
      packageName: p.package_name,
      amount: Number(p.amount || 0),
      roiDailyRate: Number(p.roi_daily_rate || 0),
      durationDays: Number(p.duration_days || 0),
      totalEarned: Number(p.total_earned || 0),
      status: p.status,
      activatedAt: p.activated_at,
      expiresAt: p.expires_at
    })),
    transactions,
    kycSubmissions: kycResult.rows.map(k => ({
      id: k.id,
      legalName: k.legal_name || '',
      documentType: k.document_type || '',
      documentLast4: k.document_last4 || '',
      status: k.status,
      adminNotes: k.admin_notes || '',
      reviewedBy: k.reviewed_by || '',
      reviewedAt: k.reviewed_at,
      createdAt: k.created_at,
      updatedAt: k.updated_at
    }))
  };
}

export default async function handler(req, res) {
  try {
    const admin = await requireAdmin(req);
    const pool = getPool();
    const userId = String(req.query?.userId || req.body?.userId || '').trim();
    if (!userId) return json(res, 400, { error: 'userId is required' });

    if (req.method === 'GET') {
      const data = await loadUser(pool, userId);
      if (!data) return json(res, 404, { error: 'User not found' });
      return json(res, 200, data);
    }

    if (req.method === 'PATCH') {
      const action = String(req.body?.action || '');
      if (action === 'kyc') {
        const status = String(req.body?.status || '');
        if (!['verified','pending','unverified','rejected'].includes(status)) {
          return json(res, 400, { error: 'Invalid KYC status' });
        }
        await pool.query('UPDATE users SET kyc_status=$1, updated_at=NOW() WHERE id=$2', [status, userId]);
        await pool.query(`
          UPDATE kyc_submissions SET status=$1, reviewed_by=$2, reviewed_at=NOW(), updated_at=NOW(), admin_notes=$3
          WHERE id=(SELECT id FROM kyc_submissions WHERE user_id=$4 ORDER BY created_at DESC LIMIT 1)
        `, [status === 'unverified' ? 'pending' : status, admin.id, String(req.body?.notes || ''), userId]);
        await pool.query(`INSERT INTO audit_logs (id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,timestamp)
          VALUES ($1,$2,$3,$4,'user',$5,$6::jsonb,NOW())`,
          [randomUUID(), admin.id, admin.email, 'Manual KYC Status Updated', userId, JSON.stringify({ kycStatus: status })]);
      } else if (action === 'status') {
        const status = String(req.body?.status || '');
        if (!['active','suspended'].includes(status)) return json(res, 400, { error: 'Invalid account status' });
        await pool.query('UPDATE users SET status=$1, updated_at=NOW() WHERE id=$2', [status, userId]);
        await pool.query(`INSERT INTO audit_logs (id,actor_user_id,actor_email,action,entity_type,entity_id,metadata,timestamp)
          VALUES ($1,$2,$3,$4,'user',$5,$6::jsonb,NOW())`,
          [randomUUID(), admin.id, admin.email, status === 'active' ? 'User Reactivated' : 'User Suspended', userId, JSON.stringify({ status })]);
      } else {
        return json(res, 400, { error: 'Unsupported action' });
      }

      const data = await loadUser(pool, userId);
      return json(res, 200, data);
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    if (String(error?.message) === 'ADMIN_REQUIRED') return json(res, 403, { error: 'Admin access required' });
    console.error('admin-user-detail failed:', error instanceof Error ? error.message : error);
    return json(res, 500, { error: 'Unable to load or update member details' });
  }
}
