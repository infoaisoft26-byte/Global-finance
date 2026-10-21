import crypto from 'node:crypto';
import { verifyFirebaseIdToken } from '../../api/_lib/firebaseAdmin.js';
import { getPool } from '../../api/_lib/db.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(body));
}

async function ensureTelegramTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telegram_link_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS telegram_link_tokens_user_idx
      ON telegram_link_tokens(user_id, created_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telegram_account_links (
      telegram_chat_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const authorization = String(req.headers.authorization || '');
    if (!authorization.startsWith('Bearer ')) return json(res, 401, { error: 'Please log in first.' });
    const decoded = await verifyFirebaseIdToken(authorization.slice(7));
    const uid = String(decoded.uid || '');
    if (!uid) return json(res, 401, { error: 'Authentication required.' });

    const pool = getPool();
    await ensureTelegramTables(pool);
    const member = await pool.query(
      "SELECT id, status, role FROM users WHERE id=$1 LIMIT 1",
      [uid],
    );
    if (!member.rows[0] || String(member.rows[0].status || '').toLowerCase() !== 'active' ||
        String(member.rows[0].role || '').toLowerCase() === 'admin') {
      return json(res, 403, { error: 'An active member account is required to link Telegram.' });
    }

    const token = crypto.randomBytes(24).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query(
      `INSERT INTO telegram_link_tokens(token_hash, user_id, expires_at)
       VALUES($1, $2, NOW() + INTERVAL '10 minutes')`,
      [tokenHash, uid],
    );

    return json(res, 200, {
      ok: true,
      botUrl: `https://t.me/GlobalFinanceHelp2026Bot?start=link_${token}`,
      expiresInSeconds: 600,
    });
  } catch (error) {
    console.error('Telegram link-token failed:', error instanceof Error ? error.message : error);
    return json(res, 503, { error: 'Telegram linking is temporarily unavailable. Please try again.' });
  }
}
