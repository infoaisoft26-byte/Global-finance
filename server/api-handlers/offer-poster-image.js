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
async function ensureTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS offer_poster_assets (
      id TEXT PRIMARY KEY, file_name TEXT NOT NULL DEFAULT '',
      content_type TEXT NOT NULL, image_data BYTEA NOT NULL,
      created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS offer_poster_upload_chunks (
      upload_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, chunk_data BYTEA NOT NULL,
      file_name TEXT NOT NULL, total_chunks INTEGER NOT NULL, total_bytes BIGINT NOT NULL,
      created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(upload_id, chunk_index)
    )
  `);
}
export default async function handler(req, res) {
  const pool = getPool();
  try {
    await ensureTables(pool);
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
    const decoded = await requireAdmin(req, pool);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = String(body.action || 'single');
    if (action === 'init') {
      const fileName = String(body.fileName || '').slice(0, 255);
      const totalBytes = Number(body.totalBytes);
      const totalChunks = Number(body.totalChunks);
      if (!fileName || !Number.isSafeInteger(totalBytes) || totalBytes < 1 || totalBytes > 10 * 1024 * 1024 ||
          !Number.isSafeInteger(totalChunks) || totalChunks < 1 || totalChunks > 32) {
        return json(res, 400, { error: 'Invalid video upload details. MP4 limit is 10 MB.' });
      }
      const uploadId = crypto.randomUUID();
      return json(res, 201, { ok: true, uploadId });
    }
    if (action === 'chunk') {
      const uploadId = String(body.uploadId || '');
      const chunkIndex = Number(body.chunkIndex);
      const totalChunks = Number(body.totalChunks);
      const totalBytes = Number(body.totalBytes);
      const encoded = String(body.data || '');
      if (!/^[0-9a-f-]{36}$/i.test(uploadId) || !Number.isSafeInteger(chunkIndex) || chunkIndex < 0 ||
          !Number.isSafeInteger(totalChunks) || totalChunks < 1 || chunkIndex >= totalChunks ||
          !Number.isSafeInteger(totalBytes) || totalBytes < 1 || totalBytes > 10 * 1024 * 1024 ||
          !encoded || encoded.length > 800000) return json(res, 400, { error: 'Invalid video chunk.' });
      const meta = await pool.query('SELECT file_name, total_chunks, total_bytes FROM offer_poster_upload_chunks WHERE upload_id=$1 LIMIT 1', [uploadId]);
      if (meta.rows[0] && (Number(meta.rows[0].total_chunks) !== totalChunks || Number(meta.rows[0].total_bytes) !== totalBytes)) {
        return json(res, 400, { error: 'Video upload details do not match.' });
      }
      const chunkData = Buffer.from(encoded, 'base64');
      if (!chunkData.length || chunkData.length > 512 * 1024) return json(res, 400, { error: 'Video chunk size is invalid.' });
      await pool.query(`INSERT INTO offer_poster_upload_chunks
        (upload_id,chunk_index,chunk_data,file_name,total_chunks,total_bytes,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (upload_id,chunk_index) DO UPDATE SET chunk_data=EXCLUDED.chunk_data`,
        [uploadId, chunkIndex, chunkData, String(body.fileName || '').slice(0,255), totalChunks, totalBytes, decoded.uid]);
      return json(res, 200, { ok: true, chunkIndex });
    }
    if (action === 'complete') {
      const uploadId = String(body.uploadId || '');
      const rows = await pool.query('SELECT chunk_index, chunk_data, total_chunks, total_bytes, file_name, created_by FROM offer_poster_upload_chunks WHERE upload_id=$1 AND created_by=$2 ORDER BY chunk_index', [uploadId, decoded.uid]);
      if (!rows.rows.length) return json(res, 400, { error: 'No video chunks were received.' });
      const expected = Number(rows.rows[0].total_chunks);
      const expectedBytes = Number(rows.rows[0].total_bytes);
      if (rows.rows.length !== expected || rows.rows.some((row, index) => Number(row.chunk_index) !== index)) return json(res, 400, { error: 'Video upload is incomplete. Please retry.' });
      const videoData = Buffer.concat(rows.rows.map(row => row.chunk_data));
      if (videoData.length !== expectedBytes || videoData.length > 10 * 1024 * 1024) return json(res, 400, { error: 'Uploaded video size did not match.' });
      const id = crypto.randomUUID();
      await pool.query('INSERT INTO offer_poster_assets (id,file_name,content_type,image_data,created_by) VALUES ($1,$2,$3,$4,$5)',
        [id, rows.rows[0].file_name, 'video/mp4', videoData, decoded.uid]);
      await pool.query('DELETE FROM offer_poster_upload_chunks WHERE upload_id=$1', [uploadId]);
      return json(res, 201, { ok: true, imageUrl: '/api/offer-poster-image?id=' + id });
    }
    const contentType = String(body.contentType || '');
    const fileName = String(body.fileName || '').slice(0, 255);
    const encoded = String(body.data || '');
    if (!/^image\/(jpeg|png|webp|gif)$/.test(contentType)) return json(res, 400, { error: 'Choose a JPG, PNG, WEBP or GIF image.' });
    if (!encoded || encoded.length > Math.ceil(3 * 1024 * 1024 * 4 / 3) + 16) return json(res, 400, { error: 'Selected poster image is too large.' });
    const imageData = Buffer.from(encoded, 'base64');
    if (!imageData.length || imageData.length > 3 * 1024 * 1024) return json(res, 400, { error: 'Poster image must be 3 MB or smaller.' });
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO offer_poster_assets (id,file_name,content_type,image_data,created_by) VALUES ($1,$2,$3,$4,$5)',
      [id, fileName, contentType, imageData, decoded.uid]);
    return json(res, 201, { ok: true, imageUrl: '/api/offer-poster-image?id=' + id });
  } catch (error) {
    const status = error.statusCode || (/Authentication required/.test(error.message) ? 401 : 500);
    console.error('offer-poster-image failed:', error.message);
    return json(res, status, { error: status === 500 ? 'Unable to save media in Neon. Please retry.' : error.message });
  }
}
