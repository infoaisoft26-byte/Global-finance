import { getPool } from './_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
  try {
    await getPool().query('SELECT 1');
    res.statusCode = 200;
    return res.end(JSON.stringify({ status: 'ok', database: 'connected' }));
  } catch {
    res.statusCode = 503;
    return res.end(JSON.stringify({ status: 'error', database: 'unavailable' }));
  }
}
