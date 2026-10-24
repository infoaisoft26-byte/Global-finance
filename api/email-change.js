import { createHash, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { withTransaction, getPool } from './_lib/db.js';
import { getFirebaseAuthAdmin, updateFirebaseAuthEmail, verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';
import { sendTransactionOtp } from './_lib/email.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.end(JSON.stringify(body));
}
function hash(value) {
  const secret = String(process.env.OTP_HASH_SECRET || process.env.RESEND_API_KEY || '').trim();
  if (!secret) throw new Error('OTP security is not configured.');
  return createHash('sha256').update(secret + ':' + value).digest('hex');
}
function maskEmail(email) {
  const [local, domain] = email.split('@');
  const first = local.slice(0, 1);
  const last = local.length > 2 ? local.slice(-1) : '';
  return first + '*'.repeat(Math.max(2, Math.min(8, local.length - first.length - last.length))) + last + '@' + domain;
}
function validEmail(value) {
  return /^[^\\s<>@]+@[^\\s<>@]+\\.[^\\s<>@]+$/.test(value) && value.length <= 254;
}
async function ensureTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS email_change_otps (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      new_email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      consumed_at TIMESTAMPTZ
    )
  `);
  await getPool().query('CREATE INDEX IF NOT EXISTS email_change_otps_user_created_idx ON email_change_otps (user_id, created_at DESC)');
}
async function assertEmailAvailable(uid, email) {
  const db = await getPool().query('SELECT id FROM users WHERE lower(email)=lower($1) AND id<>$2 LIMIT 1', [email, uid]);
  if (db.rowCount) throw new Error('EMAIL_ALREADY_IN_USE');
  const adminAuth = getFirebaseAuthAdmin();
  try {
    const found = await adminAuth.getUserByEmail(email);
    if (found.uid !== uid) throw new Error('EMAIL_ALREADY_IN_USE');
  } catch (error) {
    if (String(error?.code || '') === 'auth/user-not-found') return;
    if (String(error?.message || '') === 'EMAIL_ALREADY_IN_USE') throw error;
    if (String(error?.code || '') === 'auth/email-already-exists') throw new Error('EMAIL_ALREADY_IN_USE');
    throw error;
  }
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  let uid = '';
  let oldAuthEmail = '';
  let firebaseEmailUpdated = false;
  try {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) return json(res, 401, { error: 'Authentication required.' });
    const decoded = await verifyFirebaseIdToken(authHeader.slice(7));
    uid = String(decoded.uid || '');
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = String(body.action || '');
    const newEmail = String(body.newEmail || '').trim().toLowerCase();
    if (!validEmail(newEmail)) return json(res, 400, { error: 'Enter a valid email address.' });
    await ensureTable();

    const userQ = await getPool().query('SELECT id,email,name,referral_code,status,role FROM users WHERE id=$1 LIMIT 1', [uid]);
    const user = userQ.rows[0];
    if (!user || user.status !== 'active' || user.role !== 'user') return json(res, 403, { error: 'Active member account required.' });
    if (String(user.email || '').trim().toLowerCase() === newEmail) return json(res, 400, { error: 'This is already your registered email.' });

    if (action === 'send') {
      await assertEmailAvailable(uid, newEmail);
      const recent = await getPool().query(
        "SELECT COUNT(*)::int AS count FROM email_change_otps WHERE user_id=$1 AND created_at > NOW() - INTERVAL '15 minutes'",
        [uid]
      );
      if (Number(recent.rows[0]?.count || 0) >= 3) return json(res, 429, { error: 'Too many OTP requests. Please wait 15 minutes and try again.' });
      const code = String(randomInt(0, 1000000)).padStart(6, '0');
      const otpId = randomUUID();
      await getPool().query(
        'INSERT INTO email_change_otps (id,user_id,new_email,code_hash,expires_at) VALUES ($1,$2,$3,$4,NOW()+INTERVAL \'10 minutes\')',
        [otpId, uid, newEmail, hash(uid + ':' + newEmail + ':' + code)]
      );
      try {
        await sendTransactionOtp({ to: newEmail, name: user.name || 'Member', code, purpose: 'email_change' });
      } catch (error) {
        await getPool().query('UPDATE email_change_otps SET consumed_at=NOW() WHERE id=$1', [otpId]).catch(() => {});
        if (String(error?.message || '').includes('EMAIL_DELIVERY_NOT_CONFIGURED')) {
          return json(res, 503, { error: 'Email OTP service is not configured. Please contact support.' });
        }
        throw error;
      }
      return json(res, 200, { success: true, otpId, maskedEmail: maskEmail(newEmail), message: 'Email OTP sent.' });
    }

    if (action !== 'verify') return json(res, 400, { error: 'Invalid action.' });
    const otpId = String(body.otpId || '');
    const code = String(body.code || '').trim();
    if (!otpId || !/^\\d{6}$/.test(code)) return json(res, 400, { error: 'Enter the 6-digit email OTP.' });
    const currentFirebaseUser = await getFirebaseAuthAdmin().getUser(uid);
    oldAuthEmail = String(currentFirebaseUser.email || '').trim().toLowerCase();
    await assertEmailAvailable(uid, newEmail);

    const verified = await withTransaction(async client => {
      const otpQ = await client.query('SELECT * FROM email_change_otps WHERE id=$1 AND user_id=$2 AND new_email=$3 FOR UPDATE', [otpId, uid, newEmail]);
      const otp = otpQ.rows[0];
      if (!otp || otp.consumed_at || new Date(otp.expires_at).getTime() < Date.now()) throw new Error('OTP_EXPIRED');
      if (Number(otp.attempts || 0) >= 5) throw new Error('OTP_ATTEMPTS_EXCEEDED');
      const supplied = Buffer.from(hash(uid + ':' + newEmail + ':' + code), 'hex');
      const expected = Buffer.from(String(otp.code_hash || ''), 'hex');
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        await client.query('UPDATE email_change_otps SET attempts=attempts+1 WHERE id=$1', [otpId]);
        return false;
      }
      await updateFirebaseAuthEmail(uid, newEmail);
      firebaseEmailUpdated = true;
      await client.query('UPDATE users SET email=$1, updated_at=NOW() WHERE id=$2', [newEmail, uid]);
      await client.query('UPDATE email_change_otps SET consumed_at=NOW() WHERE id=$1', [otpId]);
      return true;
    });
    if (!verified) return json(res, 400, { error: 'Incorrect OTP. Check the code and try again.' });
    return json(res, 200, { success: true, email: newEmail, message: 'Email changed successfully.' });
  } catch (error) {
    if (firebaseEmailUpdated && uid && oldAuthEmail) {
      await updateFirebaseAuthEmail(uid, oldAuthEmail).catch(rollbackError => {
        console.error('Email change Auth rollback failed:', rollbackError instanceof Error ? rollbackError.message : rollbackError);
      });
    }
    const message = String(error?.message || '');
    if (message === 'EMAIL_ALREADY_IN_USE' || String(error?.code || '') === 'auth/email-already-exists') return json(res, 409, { error: 'This email is already registered to another account.' });
    if (message === 'OTP_EXPIRED') return json(res, 400, { error: 'OTP expired or already used. Request a new code.' });
    if (message === 'OTP_ATTEMPTS_EXCEEDED') return json(res, 429, { error: 'Too many incorrect attempts. Request a new OTP.' });
    console.error('email change failed:', message || error);
    return json(res, 500, { error: 'Unable to change email safely. Please retry or contact support.' });
  }
}
