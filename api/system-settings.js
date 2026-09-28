// Secure production system-settings API. Firestore client permissions are intentionally not required.
import crypto from 'node:crypto';
import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';
import { getPool } from './_lib/db.js';

const SETTINGS_ID = 'global_finance_system_settings';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function authenticatedUser(req) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new Error('Authentication required');
  return verifyFirebaseIdToken(token);
}

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function normalizePayload(input = {}) {
  const data = { ...input };
  data.depositNetworkLabel = 'BNB Smart Chain (BEP20)';
  data.basicPackageEnabled = true;
  data.fdPackageEnabled = true;
  data.rechargeEnabled = false;
  data.withdrawalEnabled = false;
  delete data.updatedBy;
  return data;
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });

  try {
    const decoded = await authenticatedUser(req);
    const pool = getPool();
    await ensureTable(pool);

    if (req.method === 'GET') {
      const result = await pool.query('SELECT data, updated_by, updated_at FROM app_settings WHERE id=$1 LIMIT 1', [SETTINGS_ID]);
      if (!result.rowCount) return json(res, 200, { ok: true, settings: {} });
      const row = result.rows[0];
      return json(res, 200, {
        ok: true,
        settings: {
          ...(row.data || {}),
          updatedBy: row.updated_by || undefined,
          updatedAt: row.updated_at?.toISOString?.() || String(row.updated_at),
        },
      });
    }

    const userResult = await pool.query('SELECT role, email, status FROM users WHERE id=$1 LIMIT 1', [decoded.uid]);
    const user = userResult.rows[0];
    if (!user || user.status !== 'active' || user.role !== 'admin') {
      return json(res, 403, { error: 'Admin permission required' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const settings = normalizePayload(body.settings || {});
    const updatedAt = new Date().toISOString();
    const persisted = { ...settings, updatedAt, updatedBy: decoded.uid };

    await pool.query(
      `INSERT INTO app_settings (id, data, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (id) DO UPDATE SET
         data=EXCLUDED.data,
         updated_by=EXCLUDED.updated_by,
         updated_at=NOW()`,
      [SETTINGS_ID, JSON.stringify(persisted), decoded.uid]
    );

    await pool.query(
      `INSERT INTO audit_logs (id, actor_user_id, actor_email, action, entity_type, entity_id, metadata)
       VALUES ($1,$2,$3,'SYSTEM_SETTINGS_UPDATED','settings',$4,$5::jsonb)`,
      [
        crypto.randomUUID(),
        decoded.uid,
        String(user.email || decoded.email || ''),
        SETTINGS_ID,
        JSON.stringify({
          changedFields: Object.keys(body.settings || {}),
          depositNetwork: 'BEP20',
          storage: 'neon_app_settings',
        }),
      ]
    ).catch((err) => console.warn('settings audit log failed:', err?.message || err));

    return json(res, 200, { ok: true, settings: persisted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process settings request';
    console.error('system-settings failed:', message);
    if (message === 'Authentication required') return json(res, 401, { error: message });
    return json(res, 500, { error: 'Unable to process system settings.' });
  }
}
