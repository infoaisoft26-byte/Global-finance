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

// Older real accounts may have a memberId field instead of referralCode, and
// some legacy profiles did not persist status. An omitted status is treated as
// legacy-active; explicit inactive/suspended/disabled states are never accepted.
function isEligibleSponsor(profile) {
  const status = String(profile?.status ?? '').trim().toLowerCase();
  return !status || status === 'active';
}

async function findSponsor(db, code) {
  const byReferral = await db.collection('users')
    .where('referralCode', '==', code)
    .limit(1)
    .get();
  if (!byReferral.empty) return byReferral.docs[0];

  const byMemberId = await db.collection('users')
    .where('memberId', '==', code)
    .limit(1)
    .get();
  if (!byMemberId.empty) return byMemberId.docs[0];

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const code = safeSponsor(req.query?.code);
  if (!code) return json(res, 400, { valid: false, error: 'Enter a valid referral ID (GF followed by 6 digits).' });

  try {
    const db = getFirestoreAdmin();
    const sponsorDoc = await findSponsor(db, code);
    if (!sponsorDoc) {
      return json(res, 404, { valid: false, error: 'Referral ID was not found. Check the ID shared by your referrer.' });
    }

    const sponsor = sponsorDoc.data() || {};
    if (!isEligibleSponsor(sponsor)) {
      return json(res, 404, { valid: false, error: 'This referral ID belongs to an inactive account.' });
    }

    const canonicalCode = safeSponsor(sponsor.referralCode || sponsor.memberId) || code;
    const name = String(sponsor.name || sponsor.displayName || sponsor.fullName || '').trim();
    if (!name) {
      return json(res, 409, { valid: false, error: 'The referral account has no registered name. Please contact support.' });
    }

    return json(res, 200, {
      valid: true,
      sponsor: {
        referralCode: canonicalCode,
        matchedCode: code,
        name,
      },
    });
  } catch (error) {
    console.error('referral lookup failed:', error instanceof Error ? error.message : error);
    return json(res, 500, { valid: false, error: 'Unable to verify referral ID right now. Please try again.' });
  }
}
