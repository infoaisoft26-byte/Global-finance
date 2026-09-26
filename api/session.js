import { getPool } from './_lib/db.js';
import { readCookie, verifySessionToken } from './_lib/session.js';

function mapProfile(row) {
  return {
    uid: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || undefined,
    referralCode: row.referral_code,
    sponsorId: row.sponsor_id || undefined,
    role: row.role,
    status: row.status,
    kycStatus: row.kyc_status,
    createdAt: row.created_at?.toISOString?.() || String(row.created_at),
    updatedAt: row.updated_at?.toISOString?.() || String(row.updated_at),
  };
}

function mapWallet(row) {
  return {
    userId: row.user_id,
    fundWallet: Number(row.fund_wallet || 0),
    incomeWallet: Number(row.income_wallet || 0),
    totalIncome: Number(row.total_income || 0),
    totalWithdrawal: Number(row.total_withdrawal || 0),
    basicPackageActive: Number(row.basic_package_active || 0),
    fdPackageActive: Number(row.fd_package_active || 0),
    directTeamCount: Number(row.direct_team_count || 0),
    totalTeamCount: Number(row.total_team_count || 0),
    updatedAt: row.updated_at?.toISOString?.() || String(row.updated_at),
  };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
  try {
    const token = readCookie(req, 'gf_session');
    if (!token) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ authenticated: false }));
    }
    const session = await verifySessionToken(token);
    const { rows } = await getPool().query(
      `SELECT u.*, w.user_id, w.fund_wallet, w.income_wallet, w.total_income, w.total_withdrawal,
              w.basic_package_active, w.fd_package_active, w.direct_team_count, w.total_team_count,
              w.updated_at AS wallet_updated_at
       FROM users u LEFT JOIN wallets w ON w.user_id=u.id WHERE u.id=$1 LIMIT 1`,
      [session.uid]
    );
    if (!rows[0] || rows[0].status !== 'active') {
      res.statusCode = 401;
      return res.end(JSON.stringify({ authenticated: false }));
    }
    const row = rows[0];
    const walletRow = {
      ...row,
      updated_at: row.wallet_updated_at,
    };
    res.statusCode = 200;
    return res.end(JSON.stringify({ authenticated: true, profile: mapProfile(row), wallet: mapWallet(walletRow) }));
  } catch {
    res.statusCode = 401;
    return res.end(JSON.stringify({ authenticated: false }));
  }
}
