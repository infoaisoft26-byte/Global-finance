import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';
import { getPool } from './_lib/db.js';
import { ensureIncomeSchema } from './_lib/incomeEngine.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function normalizePhone(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const compact = raw.replace(/[\s()-]/g, '');
  if (!/^\+?\d{7,15}$/.test(compact)) {
    throw new Error('Please enter a valid mobile number.');
  }
  return compact;
}

function mapProfile(row, sponsorName) {
  return {
    uid: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || undefined,
    secondPhone: row.second_phone || undefined,
    referralCode: row.referral_code,
    sponsorId: row.sponsor_id || undefined,
    sponsorName: sponsorName || undefined,
    rankCode: row.rank_code || 'MEMBER',
    role: row.role,
    status: row.status,
    kycStatus: row.kyc_status,
    panNumber: row.pan_number || undefined,
    bankAccount: row.bank_account || undefined,
    bankName: row.bank_name || undefined,
    ifscCode: row.ifsc_code || undefined,
    upiId: row.upi_id || undefined,
    createdAt: row.created_at?.toISOString?.() || String(row.created_at),
    updatedAt: row.updated_at?.toISOString?.() || String(row.updated_at),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const decoded = await verifyFirebaseIdToken(body.idToken);
    const uid = decoded.uid;
    if (!uid) return json(res, 401, { error: 'Authentication required.' });

    const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
    const hasPhone = Object.prototype.hasOwnProperty.call(body, 'phone');
    const hasSecondPhone = Object.prototype.hasOwnProperty.call(body, 'secondPhone');

    const name = hasName ? String(body.name || '').trim().slice(0, 255) : null;
    if (hasName && !name) return json(res, 400, { error: 'Full name is required.' });

    const phone = hasPhone ? normalizePhone(body.phone) : null;
    const secondPhone = hasSecondPhone ? normalizePhone(body.secondPhone) : null;

    if (phone && secondPhone && phone === secondPhone) {
      return json(res, 400, { error: 'Second mobile number must be different from the primary mobile number.' });
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureIncomeSchema(client);

      const current = await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [uid]);
      if (!current.rowCount) {
        await client.query('ROLLBACK');
        return json(res, 404, { error: 'Member account not found.' });
      }

      const row = current.rows[0];
      const nextName = hasName ? name : row.name;
      const nextPhone = hasPhone ? phone : row.phone;
      const nextSecondPhone = hasSecondPhone ? secondPhone : row.second_phone;

      const updated = await client.query(
        `UPDATE users
            SET name=$2,
                phone=$3,
                second_phone=$4,
                updated_at=NOW()
          WHERE id=$1
          RETURNING *`,
        [uid, nextName, nextPhone, nextSecondPhone]
      );

      const sponsorResult = updated.rows[0].sponsor_id
        ? await client.query(
            "SELECT name FROM users WHERE referral_code=$1 AND status='active' LIMIT 1",
            [updated.rows[0].sponsor_id]
          )
        : { rows: [] };

      await client.query('COMMIT');
      return json(res, 200, {
        ok: true,
        profile: mapProfile(updated.rows[0], sponsorResult.rows[0]?.name),
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('member profile update failed:', error instanceof Error ? error.message : error);
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Database connection URL') || message.includes('DATABASE_URL')) {
      return json(res, 503, { error: 'Profile database is not configured.' });
    }
    return json(res, 500, { error: message || 'Unable to update profile.' });
  }
}
