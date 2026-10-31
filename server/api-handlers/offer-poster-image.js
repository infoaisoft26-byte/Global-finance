import crypto from 'node:crypto';
import { verifyFirebaseIdToken } from '../../api/_lib/firebaseAdmin.js';
import { getPool } from '../../api/_lib/db.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
async function requireAdmin(req, pool) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new Error('Authentication required');
  const decoded = await verifyFirebaseIdToken(token);
  const result = await pool.query('SELECT role, status FROM users WHERE id=$1 LIMIT 1', [decoded.uid]);
  if (!result.rows[0] || result.rows[0].role !== 'admin' || result.rows[0].status !== 'active') {
    const error = new Error('Admin permission required'); error.statusCode = 403; throw error;
  }
  return decoded;
}
export default async function handler(req, res) {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS offer_poster_assets (
      id TEXT PRIMARY KEY, file_name TEXT NOT NULL DEFAULT '',
      content_type TEXT NOT NULL, image_data BYTEA NOT NULL,
      created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  if (req.method === 'GET') {
    const id = String(req.query?.id || new URL(req.url, 'https://globalfinance1.online').searchParams.get('id') || '');
    if (!id) return json(res, 400, { error: 'Image ID is required.' });
    const result = await pool.query('SELECT content_type, image_data FROM offer_poster_assets WHERE id=$1 LIMIT 1', [id]);
    if (!result.rows[0]) return json(res, 404, { error: 'Poster image not found.' });
    const data = result.rows[0].image_data;
    const isVideo = result.rows[0].content_type === 'video/mp4';
    res.setHeader('Content-Type', result.rows[0].content_type);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (isVideo) res.setHeader('Accept-Ranges', 'bytes');
    const range = req.headers.range;
    if (isVideo && range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${data.length}`); return res.end(); }
      const start = match[1] ? Number(match[1]) : Math.max(0, data.length - Number(match[2]));
      const end = match[2] && match[1] ? Math.min(Number(match[2]), data.length - 1) : data.length - 1;
      if (start > end || start >= data.length) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${data.length}`); return res.end(); }
      res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${data.length}`); res.setHeader('Content-Length', end-start+1);
      return res.end(data.subarray(start, end + 1));
    }
    res.statusCode = 200; res.setHeader('Content-Length', data.length); return res.end(data);
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const decoded = await requireAdmin(req, pool);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const contentType = String(body.contentType || '');
    const fileName = String(body.fileName || '').slice(0, 255);
    const encoded = String(body.data || '');
    if (!/^image\/(jpeg|png|webp|gif)$/.test(contentType) && contentType !== 'video/mp4') return json(res, 400, { error: 'Choose a JPG, PNG, WEBP or GIF image.' });
    const maxBytes = contentType === 'video/mp4' ? 2 * 1024 * 1024 : 3 * 1024 * 1024;
    if (!encoded || encoded.length > Math.ceil(maxBytes * 4 / 3) + 16) return json(res, 400, { error: 'Selected media file is too large.' });
    const imageData = Buffer.from(encoded, 'base64');
    if (!imageData.length || imageData.length > maxBytes) return json(res, 400, { error: contentType === 'video/mp4' ? 'MP4 must be 2 MB or smaller.' : 'Poster image must be 3 MB or smaller.' });
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO offer_poster_assets (id,file_name,content_type,image_data,created_by) VALUES ($1,$2,$3,$4,$5)',
      [id, fileName, contentType, imageData, decoded.uid]);
    return json(res, 201, { ok: true, imageUrl: '/api/offer-poster-image?id=' + id });
  } catch (error) {
    const status = error.statusCode || (/Authentication required/.test(error.message) ? 401 : 500);
    console.error('offer-poster-image failed:', error.message);
    return json(res, status, { error: status === 500 ? 'Unable to save poster image in Neon.' : error.message });
  }
}
