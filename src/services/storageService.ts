import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';
import { db, storage } from '../lib/firebase.ts';

export interface StoredEncryptedDocument {
  id: string;
  userId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
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
  expiresAt: number;
  issuedTo: string;
}

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const IO_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = IO_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs))
  ]);
}

export function validateKycFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: `File "${file.name}" exceeds the maximum allowable size of 8MB (${(file.size / 1024 / 1024).toFixed(2)}MB).` };
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    return { valid: false, error: `Invalid file format for "${file.name}". Supported types: PDF, PNG, JPEG, WEBP. Provided: ${file.type || 'unknown'}.` };
  }
  return { valid: true };
}

const activeSignedTokens = new Map<string, SignedDocumentAccess>();

if (typeof window !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [token, access] of activeSignedTokens.entries()) {
      if (access.expiresAt <= now) activeSignedTokens.delete(token);
    }
  }, 30000);
}

export async function uploadToPrivateStorage(
  userId: string,
  docType: 'identity' | 'address',
  file: File,
  _dataUrl?: string
): Promise<string> {
  const validation = validateKycFile(file);
  if (!validation.valid) throw new Error(validation.error);

  const storageDocId = `kyc_blob_${userId}_${docType}_${Date.now()}`;
  const storagePath = `private_kyc/${userId}/${storageDocId}/${file.name}`;
  const objectRef = ref(storage, storagePath);

  await withTimeout(
    uploadBytes(objectRef, file, {
      contentType: file.type,
      customMetadata: { ownerUid: userId, documentType: docType }
    }),
    'KYC document upload timed out. Please check your connection and retry.'
  );

  const storedDoc: StoredEncryptedDocument = {
    id: storageDocId,
    userId,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    storagePath,
    uploadedAt: new Date().toISOString(),
    checksum: btoa(`${file.name}-${file.size}-${Date.now()}`).slice(0, 16)
  };

  await withTimeout(
    setDoc(doc(db, 'private_kyc_storage', storageDocId), storedDoc),
    'KYC metadata save timed out. Please retry.'
  );

  return storageDocId;
}

function bytesToDataUrl(bytes: ArrayBuffer, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: mimeType });
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to prepare document preview.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
}

export async function generateSignedDocumentUrl(
  storageDocId: string,
  requestorUserId: string,
  ttlSeconds: number = 300
): Promise<{ signedUrl: string; expiresAt: number; access: SignedDocumentAccess }> {
  const snap = await withTimeout(
    getDoc(doc(db, 'private_kyc_storage', storageDocId)),
    'Document metadata lookup timed out.'
  );

  if (!snap.exists()) throw new Error('Private document record not found.');
  const stored = snap.data() as StoredEncryptedDocument;
  if (stored.userId !== requestorUserId) throw new Error('You do not have access to this document.');

  const bytes = await withTimeout(
    getBytes(ref(storage, stored.storagePath), MAX_FILE_SIZE_BYTES),
    'Document preview download timed out.'
  );
  const dataUrl = await bytesToDataUrl(bytes, stored.mimeType);

  const randomBytes = new Uint8Array(24);
  crypto.getRandomValues(randomBytes);
  const token = Array.from(randomBytes, b => b.toString(16).padStart(2, '0')).join('');
  const expiresAt = Date.now() + ttlSeconds * 1000;

  const access: SignedDocumentAccess = {
    token,
    documentId: storageDocId,
    fileName: stored.fileName,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    dataUrl,
    expiresAt,
    issuedTo: requestorUserId
  };

  activeSignedTokens.set(token, access);
  const signedUrl = `signed://vault.globalfinance.internal/kyc/${storageDocId}?token=${token}&expires=${expiresAt}`;
  return { signedUrl, expiresAt, access };
}

export function resolveSignedDocument(token: string): { valid: boolean; access?: SignedDocumentAccess; error?: string } {
  const access = activeSignedTokens.get(token);
  if (!access) return { valid: false, error: 'Signed access URL is invalid or has already been revoked.' };
  if (Date.now() > access.expiresAt) {
    activeSignedTokens.delete(token);
    return { valid: false, error: 'The temporary signed access ticket has expired. Please request a new signed URL.' };
  }
  return { valid: true, access };
}
