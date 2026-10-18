import { getFirestoreAdmin } from './_lib/firebaseAdmin.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function safeSponsor(value) {
  const v = String(value || '').trim().toUpperCase();
  return /^GF\d{6}$/.test(v) ? v : '';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const code = safeSponsor(req.query?.code);
  if (!code) return json(res, 400, { valid: false, error: 'Enter a valid referral ID.' });

  try {
    // Registration and auth-sync use Firestore as the member profile source.
    // Looking up sponsors in PostgreSQL returned false negatives for valid
    // Firebase members who were not mirrored into the SQL users table.
    const db = getFirestoreAdmin();
    const result = await db.collection('users').where('referralCode', '==', code).limit(1).get();
    if (result.empty) {
      return json(res, 404, { valid: false, error: 'Referral ID was not found.' });
    }

    const sponsor = result.docs[0].data() || {};
    if (sponsor.status !== 'active') {
      return json(res, 404, { valid: false, error: 'This referral ID is not active.' });
    }

    return json(res, 200, {
      valid: true,
      sponsor: {
        referralCode: code,
        name: String(sponsor.name || '').trim() || 'Global Finance Member',
      },
    });
  } catch (error) {
    console.error('referral lookup failed:', error instanceof Error ? error.message : error);
    return json(res, 500, { valid: false, error: 'Unable to verify referral ID right now.' });
  }
}
