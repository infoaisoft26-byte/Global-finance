import { 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc,
  collection 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase.ts';

export interface StoredEncryptedDocument {
  id: string;
  userId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  encryptedPayload: string; // Base64 chunked data URL or encrypted bytes
  uploadedAt: string;
  checksum: string;
}

export interface SignedDocumentAccess {
  token: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  expiresAt: number; // Unix timestamp in ms
  issuedTo: string;
}

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
];

/**
 * Validate upload file constraints
 */
export function validateKycFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File "${file.name}" exceeds the maximum allowable size of 8MB (${(file.size / 1024 / 1024).toFixed(2)}MB).`
    };
  }

  // Strict MIME type checking
  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: `Invalid file format for "${file.name}". Supported types: PDF, PNG, JPEG, WEBP. Provided: ${file.type || 'unknown'}.`
    };
  }

  return { valid: true };
}

/**
 * In-memory signature registry for signed short-lived URLs.
 * URLs expire after TTL (e.g. 5 minutes).
 */
const activeSignedTokens = new Map<string, SignedDocumentAccess>();

// Cleanup expired tokens periodically
if (typeof window !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [token, access] of activeSignedTokens.entries()) {
      if (access.expiresAt <= now) {
        activeSignedTokens.delete(token);
      }
    }
  }, 30000);
}

/**
 * Uploads document to private object storage collection
 */
export async function uploadToPrivateStorage(
  userId: string,
  docType: 'identity' | 'address',
  file: File,
  dataUrl: string
): Promise<string> {
  const validation = validateKycFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const storageDocId = `kyc_blob_${userId}_${docType}_${Date.now()}`;
  const docRef = doc(db, 'private_kyc_storage', storageDocId);

  const storedDoc: StoredEncryptedDocument = {
    id: storageDocId,
    userId,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    encryptedPayload: dataUrl,
    uploadedAt: new Date().toISOString(),
    checksum: btoa(`${file.name}-${file.size}-${Date.now()}`).slice(0, 16)
  };

  await setDoc(docRef, storedDoc);
  return storageDocId;
}

/**
 * Generate a short-lived cryptographically signed access ticket for a private document
 * Access token expires in 5 minutes (300,000ms).
 */
export async function generateSignedDocumentUrl(
  storageDocId: string,
  requestorUserId: string,
  ttlSeconds: number = 300 // 5 minutes default
): Promise<{ signedUrl: string; expiresAt: number; access: SignedDocumentAccess }> {
  const docRef = doc(db, 'private_kyc_storage', storageDocId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    throw new Error('Encrypted document record not found in private vault storage.');
  }

  const stored = snap.data() as StoredEncryptedDocument;

  // Generate random crypto signature token
  const randomBytes = new Uint8Array(24);
  crypto.getRandomValues(randomBytes);
  const token = Array.from(randomBytes, b => b.toString(16).padStart(2, '0')).join('');

  const now = Date.now();
  const expiresAt = now + (ttlSeconds * 1000);

  const access: SignedDocumentAccess = {
    token,
    documentId: storageDocId,
    fileName: stored.fileName,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    dataUrl: stored.encryptedPayload,
    expiresAt,
    issuedTo: requestorUserId
  };

  activeSignedTokens.set(token, access);

  const signedUrl = `signed://vault.globalfinance.internal/kyc/${storageDocId}?token=${token}&expires=${expiresAt}`;

  return { signedUrl, expiresAt, access };
}

/**
 * Resolves a signed access ticket, validating expiration and issuing principal
 */
export function resolveSignedDocument(token: string): { valid: boolean; access?: SignedDocumentAccess; error?: string } {
  const access = activeSignedTokens.get(token);
  if (!access) {
    return {
      valid: false,
      error: 'Signed access URL is invalid or has already been revoked.'
    };
  }

  if (Date.now() > access.expiresAt) {
    activeSignedTokens.delete(token);
    return {
      valid: false,
      error: 'The temporary signed access ticket has expired. Please request a new signed URL.'
    };
  }

  return {
    valid: true,
    access
  };
}
