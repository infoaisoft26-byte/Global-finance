import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createRemoteJWKSet, jwtVerify } from 'jose';

function readServiceAccountJson() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Service account JSON must be an object.');
    }
    return parsed;
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid Firebase service-account JSON.');
  }
}

function projectIdFromServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  if (!raw.trim()) return '';
  try {
    return String(JSON.parse(raw).project_id || '').trim();
  } catch {
    return '';
  }
}

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || projectIdFromServiceAccount() || 'global-finance-72e35';
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

function adminApp() {
  if (getApps().length) return getApps()[0];

  const serviceAccount = readServiceAccountJson();
  const clientEmail = String(serviceAccount?.client_email || process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = String(serviceAccount?.private_key || process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  const projectId = String(serviceAccount?.project_id || FIREBASE_PROJECT_ID).trim();

  if (!clientEmail || !privateKey) {
    throw new Error('Firebase Admin credentials are missing. Configure FIREBASE_SERVICE_ACCOUNT_JSON or both FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in Vercel Production.');
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export function getFirestoreAdmin() {
  return getFirestore(adminApp());
}

export async function deleteFirebaseAuthUser(uid) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('Firebase user ID is required');
  await getAuth(adminApp()).deleteUser(id);
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
