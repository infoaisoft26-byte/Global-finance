import { verifyFirebaseIdToken } from './firebaseAdmin.js';

export async function createSessionToken({ idToken }) {
  if (!idToken) throw new Error('Firebase ID token is required');
  await verifyFirebaseIdToken(idToken);
  return idToken;
}

export async function verifySessionToken(token) {
  const decoded = await verifyFirebaseIdToken(token);
  return {
    uid: String(decoded.uid || ''),
    role: 'user',
    email: String(decoded.email || ''),
  };
}

export function sessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `gf_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=3300${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `gf_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

export function readCookie(req, name) {
  const header = req.headers?.cookie || '';
  const part = header.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : '';
}
