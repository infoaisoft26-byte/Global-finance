import crypto from 'node:crypto';
import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';
import { getPool } from './_lib/db.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function auth(req) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new Error('Authentication required');
  return verifyFirebaseIdToken(token);
}

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS offer_posters (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      image_url TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cta_label TEXT NOT NULL DEFAULT '',
      cta_url TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT FALSE,
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_offer_posters_active ON offer_posters(active, start_at, end_at)');
}

function normalize(body = {}) {
  const title = String(body.title || '').trim().slice(0, 160);
  const imageUrl = String(body.imageUrl || '').trim().slice(0, 2000);
  const description = String(body.description || '').trim().slice(0, 1000);
  const ctaLabel = String(body.ctaLabel || '').trim().slice(0, 80);
  const ctaUrl = String(body.ctaUrl || '').trim().slice(0, 2000);
  const startAt = body.startAt ? new Date(body.startAt) : null;
  const endAt = body.endAt ? new Date(body.endAt) : null;
  if (!title || !imageUrl) throw new Error('Poster title and image URL are required.');
  try { new URL(imageUrl); } catch { throw new Error('Please enter a valid poster image URL.'); }
  if (ctaUrl) {
    try { new URL(ctaUrl, 'https://globalfinance1.online'); } catch { throw new Error('Please enter a valid offer link.'); }
  }
  if (startAt && Number.isNaN(startAt.getTime())) throw new Error('Invalid start date.');
  if (endAt && Number.isNaN(endAt.getTime())) throw new Error('Invalid end date.');
  if (startAt && endAt && startAt >= endAt) throw new Error('End date must be after start date.');
  return { title, imageUrl, description, ctaLabel, ctaUrl, active: body.active !== false, startAt, endAt };
}

function serialize(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    imageUrl: row.image_url,
    description: row.description,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    active: row.active,
    startAt: row.start_at ? new Date(row.start_at).toISOString() : '',
    endAt: row.end_at ? new Date(row.end_at).toISOString() : '',
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
  try {
    const decoded = await auth(req);
    const pool = getPool();
    await ensureTable(pool);

    const adminResult = await pool.query('SELECT role, email, status FROM users WHERE id=$1 LIMIT 1', [decoded.uid]);
    const admin = adminResult.rows[0];
    const isAdmin = !!admin && admin.status === 'active' && admin.role === 'admin';

    if (req.method === 'GET') {
      const result = await pool.query(`
        SELECT * FROM offer_posters
        WHERE active = TRUE
          AND (start_at IS NULL OR start_at <= NOW())
          AND (end_at IS NULL OR end_at > NOW())
        ORDER BY updated_at DESC
        LIMIT 1
      `);
      return json(res, 200, { ok: true, poster: serialize(result.rows[0]) });
    }

    if (!isAdmin) return json(res, 403, { error: 'Admin permission required' });

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const id = String(body.id || '');
      if (!id) return json(res, 400, { error: 'Poster ID is required.' });
      await pool.query('UPDATE offer_posters SET active=FALSE, updated_at=NOW() WHERE id=$1', [id]);
      return json(res, 200, { ok: true });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const data = normalize(body);
    const id = String(body.id || crypto.randomUUID());

    await pool.query('BEGIN');
    try {
      if (data.active) await pool.query('UPDATE offer_posters SET active=FALSE, updated_at=NOW() WHERE active=TRUE');
      await pool.query(`
        INSERT INTO offer_posters
          (id,title,image_url,description,cta_label,cta_url,active,start_at,end_at,created_by,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        ON CONFLICT (id) DO UPDATE SET
          title=EXCLUDED.title,
          image_url=EXCLUDED.image_url,
          description=EXCLUDED.description,
          cta_label=EXCLUDED.cta_label,
          cta_url=EXCLUDED.cta_url,
          active=EXCLUDED.active,
          start_at=EXCLUDED.start_at,
          end_at=EXCLUDED.end_at,
          updated_at=NOW()
      `, [id,data.title,data.imageUrl,data.description,data.ctaLabel,data.ctaUrl,data.active,data.startAt,data.endAt,decoded.uid]);
      await pool.query('COMMIT');
    } catch (e) {
      await pool.query('ROLLBACK');
      throw e;
    }

    await pool.query(`
      INSERT INTO audit_logs (id, actor_user_id, actor_email, action, entity_type, entity_id, metadata)
      VALUES ($1,$2,$3,$4,'settings',$5,$6::jsonb)
    `, [
      crypto.randomUUID(), decoded.uid, String(admin.email || decoded.email || ''),
      data.active ? 'OFFER_POSTER_PUBLISHED' : 'OFFER_POSTER_SAVED',
      id, JSON.stringify({ title: data.title, active: data.active })
    ]).catch((err) => console.warn('offer poster audit log failed:', err?.message || err));

    const result = await pool.query('SELECT * FROM offer_posters WHERE id=$1 LIMIT 1', [id]);
    return json(res, 200, { ok: true, poster: serialize(result.rows[0]) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process offer poster.';
    console.error('offer-poster failed:', message);
    const status = /Authentication required/.test(message) ? 401 : /required|valid|date|URL|link/i.test(message) ? 400 : 500;
    return json(res, status, { error: status === 500 ? 'Unable to process offer poster.' : message });
  }
}
