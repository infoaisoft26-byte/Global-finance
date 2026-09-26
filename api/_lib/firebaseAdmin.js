import { createRemoteJWKSet, jwtVerify } from 'jose';

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'global-finance-72e35';
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export async function verifyFirebaseIdToken(idToken) {
  if (!idToken) throw new Error('Firebase ID token is required');

  const { payload, protectedHeader } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: FIREBASE_ISSUER,
    audience: FIREBASE_PROJECT_ID,
    algorithms: ['RS256'],
  });

  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Firebase token subject is missing');
  }

  if (!protectedHeader.kid) {
    throw new Error('Firebase token key id is missing');
  }

  return {
    ...payload,
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : '',
    name: typeof payload.name === 'string' ? payload.name : '',
  };
}
