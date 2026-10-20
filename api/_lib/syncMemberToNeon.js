import { getPool } from './db.js';

/**
 * Mirror the verified Firebase/Firestore member profile into the Neon database
 * used by the admin screens and financial APIs. Wallet creation is insert-only
 * so this never overwrites an existing financial balance.
 */
export async function syncMemberToNeon(profile, wallet = {}) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_status VARCHAR(16) NOT NULL DEFAULT 'active'`);
    await client.query(
      `INSERT INTO users
        (id, email, name, phone, referral_code, sponsor_id, role, status, referral_status, kyc_status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::timestamptz,NOW()),NOW())
       ON CONFLICT (id) DO UPDATE SET
         email=EXCLUDED.email,
         name=EXCLUDED.name,
         phone=COALESCE(EXCLUDED.phone, users.phone),
         sponsor_id=COALESCE(EXCLUDED.sponsor_id, users.sponsor_id),
         role=EXCLUDED.role,
         status=EXCLUDED.status,
         kyc_status=EXCLUDED.kyc_status,
         updated_at=NOW()`,
      [
        profile.uid,
        profile.email,
        profile.name || 'Global Finance Member',
        profile.phone || null,
        profile.referralCode,
        profile.sponsorId || null,
        profile.role || 'user',
        profile.status || 'active',
        profile.referralStatus || 'active',
        profile.kycStatus || 'unverified',
        profile.createdAt?.toDate?.()?.toISOString?.() || profile.createdAt || null,
      ],
    );

    // Only create a missing wallet row. Existing balances remain untouched.
    await client.query(
      `INSERT INTO wallets
        (user_id, fund_wallet, income_wallet, total_income, total_withdrawal,
         basic_package_active, fd_package_active, direct_team_count, total_team_count, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [
        profile.uid,
        Number(wallet.fundWallet || 0),
        Number(wallet.incomeWallet || 0),
        Number(wallet.totalIncome || 0),
        Number(wallet.totalWithdrawal || 0),
        Number(wallet.basicPackageActive || 0),
        Number(wallet.fdPackageActive || 0),
        Number(wallet.directTeamCount || 0),
        Number(wallet.totalTeamCount || 0),
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
