import { SignJWT, jwtVerify } from 'jose';

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters');
  return new TextEncoder().encode(value);
}

export async function createSessionToken({ uid, role, email }) {
  return new SignJWT({ role, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(uid)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(secret());
}

export async function verifySessionToken(token) {
  const { payload } = await jwtVerify(token, secret());
  return {
    uid: String(payload.sub || ''),
    role: String(payload.role || 'user'),
    email: String(payload.email || ''),
  };
}

export function sessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `gf_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200${secure}`;
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
