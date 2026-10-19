import { getFirestoreAdmin, verifyFirebaseIdToken } from '../../api/_lib/firebaseAdmin.js';
import { getPool } from '../../api/_lib/db.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const authorization = String(req.headers.authorization || '');
    if (!authorization.startsWith('Bearer ')) return json(res, 401, { error: 'Authentication required' });
    const decoded = await verifyFirebaseIdToken(authorization.slice(7));
    const uid = String(decoded.uid || '');
    if (!uid) return json(res, 401, { error: 'Authentication required' });

    const result = await getPool().query(
      `SELECT u.status AS user_status,
              w.fund_wallet, w.income_wallet, w.total_income, w.total_withdrawal,
              w.basic_package_active, w.fd_package_active, w.direct_team_count, w.total_team_count,
              w.referral_income, w.today_roi_income, w.today_level_income, w.total_roi_income,
              w.total_level_income, w.fd_referral_income, w.fd_today_roi_income,
              w.fd_today_level_income, w.fd_total_roi_income, w.fd_total_level_income,
              w.total_salary, w.updated_at
         FROM users u
         LEFT JOIN wallets w ON w.user_id = u.id
        WHERE u.id = $1
        LIMIT 1`,
      [uid]
    );
    const row = result.rows[0];
    if (!row || String(row.user_status || '').toLowerCase() !== 'active') {
      return json(res, 403, { error: 'Active member account required' });
    }
    // Pending recharge requests are shown separately from spendable funds.
    // They must not increase fund_wallet until the on-chain transfer is verified
    // and the credit is written to the authoritative Neon ledger.
    let pendingUsdt = 0;
    let pendingRechargeCount = 0;
    let pendingRechargeStatusAvailable = true;
    try {
      const firestore = getFirestoreAdmin();
      const pendingSnap = await firestore.collection('usdtRecharges').where('userId', '==', uid).get();
      for (const doc of pendingSnap.docs) {
        const recharge = doc.data() || {};
        const status = String(recharge.status ?? '').trim().toLowerCase();
        if (!['pending', 'under_review', 'processing', 'submitted'].includes(status)) continue;
        const amount = Number(recharge.amountUsdt ?? recharge.amount ?? 0);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        pendingUsdt += amount;
        pendingRechargeCount += 1;
      }
      pendingUsdt = Number(pendingUsdt.toFixed(8));
    } catch (pendingError) {
      pendingRechargeStatusAvailable = false;
      console.warn('Pending USDT summary unavailable:', pendingError instanceof Error ? pendingError.message : pendingError);
    }

    const n = value => Number(value || 0);
    return json(res, 200, {
      wallet: {
        pendingUsdt,
        pendingRechargeCount,
        pendingRechargeStatusAvailable,
        userId: uid,
        fundWallet: n(row.fund_wallet),
        incomeWallet: n(row.income_wallet),
        totalIncome: n(row.total_income),
        totalWithdrawal: n(row.total_withdrawal),
        basicPackageActive: n(row.basic_package_active),
        fdPackageActive: n(row.fd_package_active),
        directTeamCount: n(row.direct_team_count),
        totalTeamCount: n(row.total_team_count),
        referralIncome: n(row.referral_income),
        todayRoiIncome: n(row.today_roi_income),
        todayLevelIncome: n(row.today_level_income),
        totalRoiIncome: n(row.total_roi_income),
        totalLevelIncome: n(row.total_level_income),
        fdReferralIncome: n(row.fd_referral_income),
        fdTodayRoiIncome: n(row.fd_today_roi_income),
        fdTodayLevelIncome: n(row.fd_today_level_income),
        fdTotalRoiIncome: n(row.fd_total_roi_income),
        fdTotalLevelIncome: n(row.fd_total_level_income),
        totalSalary: n(row.total_salary),
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('member-wallet failed:', error instanceof Error ? error.message : error);
    const message = String(error?.message || '');
    if (message.includes('Firebase') || message.includes('token')) {
      return json(res, 401, { error: 'Authentication required' });
    }
    return json(res, 503, { error: 'Wallet service is temporarily unavailable' });
  }
}
