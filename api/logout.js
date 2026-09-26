import { clearSessionCookie } from './_lib/session.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.statusCode = 200;
  return res.end(JSON.stringify({ ok: true }));
}
