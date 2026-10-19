import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const SERVICE_ACCOUNT_JSON = String(
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
  ''
).trim();
let SERVICE_ACCOUNT = null;
let SERVICE_ACCOUNT_JSON_INVALID = false;
if (SERVICE_ACCOUNT_JSON) {
  try {
    SERVICE_ACCOUNT = JSON.parse(SERVICE_ACCOUNT_JSON);
  } catch {
    SERVICE_ACCOUNT_JSON_INVALID = true;
  }
}
const FIREBASE_PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  SERVICE_ACCOUNT?.project_id ||
  'global-finance-72e35';
const FIREBASE_CLIENT_EMAIL =
  process.env.FIREBASE_CLIENT_EMAIL ||
  SERVICE_ACCOUNT?.client_email ||
  '';
const FIREBASE_PRIVATE_KEY = String(
  process.env.FIREBASE_PRIVATE_KEY ||
  SERVICE_ACCOUNT?.private_key ||
  ''
).replace(/\\n/g, '\n');
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

function adminApp() {
  if (getApps().length) return getApps()[0];
  if (SERVICE_ACCOUNT_JSON_INVALID) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }
  if (!FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    throw new Error('Firebase Admin credentials are not configured on the server.');
  }
  return initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY,
    }),
  });
}

export function getFirestoreAdmin() {
  return getFirestore(adminApp());
}

export async function getMaintenanceState() {
  try {
    const snap = await getFirestoreAdmin().collection('system').doc('settings').get();
    const data = snap.exists ? (snap.data() || {}) : {};
    return {
      maintenanceMode: data.maintenanceMode === true,
      message: typeof data.maintenanceMessage === 'string' && data.maintenanceMessage.trim()
        ? data.maintenanceMessage.trim()
        : 'System maintenance is in progress. Please try again later.',
      updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt || null,
    };
  } catch (error) {
    console.error('maintenance state read failed:', error instanceof Error ? error.message : error);
    return { maintenanceMode: false, message: '' };
  }
}

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
