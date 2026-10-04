import { getPool } from './_lib/db.js';
import { ensureIncomeSchema } from './_lib/incomeEngine.js';

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
  if (!code) return json(res, 400, { valid: false, error: 'A valid referral ID is required.' });

  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await ensureIncomeSchema(client);
      const result = await client.query(
        'SELECT referral_code, name FROM users WHERE referral_code=$1 AND status=\'active\' LIMIT 1',
        [code]
      );

      if (!result.rowCount) {
        return json(res, 404, { valid: false, error: 'Active sponsor not found.' });
      }

      return json(res, 200, {
        valid: true,
        sponsor: {
          referralCode: result.rows[0].referral_code,
          name: result.rows[0].name,
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('referral lookup failed:', error instanceof Error ? error.message : error);
    return json(res, 500, { valid: false, error: 'Unable to verify referral ID.' });
  }
}
