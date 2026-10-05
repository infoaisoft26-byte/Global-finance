import { getPool } from './_lib/db.js';
import { ensureIncomeSchema } from './_lib/incomeEngine.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function safeMemberId(value) {
  const v = String(value || '').trim().toUpperCase();
  return /^GF\d{6}$/.test(v) ? v : '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const memberId = safeMemberId(req.body?.memberId);
  if (!memberId) return json(res, 400, { error: 'Please enter a valid GF Member ID.' });

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await ensureIncomeSchema(client);
      const result = await client.query(
        'SELECT email FROM users WHERE referral_code=$1 AND status=\'active\' LIMIT 1',
        [memberId]
      );

      // Keep the response generic for unknown/inactive member IDs.
      if (!result.rowCount || !result.rows[0]?.email) {
        return json(res, 401, { error: 'Invalid GF Member ID or password.' });
      }

      return json(res, 200, { email: result.rows[0].email });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('member login lookup failed:', error instanceof Error ? error.message : error);
    return json(res, 500, { error: 'Unable to process login right now. Please try again.' });
  }
}
