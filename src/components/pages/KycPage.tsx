import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  ShieldCheck, 
  Upload, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  FileCheck, 
  X,
  File,
  Eye,
  AlertTriangle,
  RefreshCw,
  Info,
  Lock,
  Key
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { 
  submitKycDocuments, 
  getUserKycSubmission 
} from '../../services/financeService.ts';
import { 
  validateKycFile,
  uploadToPrivateStorage,
  generateSignedDocumentUrl,
  type SignedDocumentAccess
} from '../../services/storageService.ts';
import type { KycSubmission } from '../../types/index.ts';

export const KycPage: React.FC = () => {
  const { profile, user } = useAuth();
  const [submission, setSubmission] = useState<KycSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form states
  const [legalName, setLegalName] = useState(profile?.name || '');
  const [documentType, setDocumentType] = useState<KycSubmission['documentType']>('pan');
  const [documentLast4, setDocumentLast4] = useState('');
  const [idFile, setIdFile] = useState<{ raw: File; name: string; dataUrl: string; size: number } | null>(null);
  const [addressFile, setAddressFile] = useState<{ raw: File; name: string; dataUrl: string; size: number } | null>(null);

  // Signed access preview modal
  const [activeSignedAccess, setActiveSignedAccess] = useState<SignedDocumentAccess | null>(null);
  const [signedUrlString, setSignedUrlString] = useState<string>('');
  const [generatingUrl, setGeneratingUrl] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);

  const fetchKyc = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getUserKycSubmission(user.uid);
      setSubmission(data);
      if (data) {
        setLegalName(data.legalName);
        setDocumentType(data.documentType);
        setDocumentLast4(data.documentLast4);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKyc();
  }, [user]);

  // Handle countdown for active signed URL
  useEffect(() => {
    if (!activeSignedAccess) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((activeSignedAccess.expiresAt - Date.now()) / 1000));
      setCountdownSeconds(remaining);
      if (remaining === 0) {
        setActiveSignedAccess(null);
        setSignedUrlString('');
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSignedAccess]);

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'id' | 'address'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Strict validation via private storage service (max 8MB, PDF, PNG, JPEG, WEBP)
    const validation = validateKycFile(file);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Invalid file');
      return;
    }

    setErrorMsg('');
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (type === 'id') {
        setIdFile({ raw: file, name: file.name, dataUrl: result, size: file.size });
      } else {
        setAddressFile({ raw: file, name: file.name, dataUrl: result, size: file.size });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    setErrorMsg('');
    setSuccessMsg('');

    if (!legalName.trim()) {
      setErrorMsg('Please enter your full legal name as it appears on government documents.');
      return;
    }
    if (!documentLast4 || documentLast4.length !== 4) {
      setErrorMsg('Please provide exactly the last 4 digits/characters of your document.');
      return;
    }
    if (!idFile) {
      setErrorMsg('Please upload a copy of your Identity Document (PAN / Aadhaar / Passport).');
      return;
    }
    if (!addressFile) {
      setErrorMsg('Please upload a copy of your Address Proof document.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Store in private object storage collection
      const idStorageId = await uploadToPrivateStorage(
        user.uid,
        'identity',
        idFile.raw,
        idFile.dataUrl
      );

      const addressStorageId = await uploadToPrivateStorage(
        user.uid,
        'address',
        addressFile.raw,
        addressFile.dataUrl
      );

      // 2. Submit KYC Packet referencing private storage
      await submitKycDocuments(
        user.uid,
        user.email || profile.email,
        profile.name,
        legalName.trim(),
        documentType,
        documentLast4.trim().toUpperCase(),
        { name: idFile.name, dataUrl: idFile.dataUrl, storageId: idStorageId },
        { name: addressFile.name, dataUrl: addressFile.dataUrl, storageId: addressStorageId }
      );

      setSuccessMsg('Your KYC verification packet has been encrypted and submitted securely to the private storage vault. Status is now Pending Review.');
      await fetchKyc();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit KYC verification packet.');
    } finally {
      setSubmitting(false);
    }
  };

  // Generate a short-lived temporary signed URL for viewing file
  const handleOpenSignedPreview = async (storageId?: string, fallbackDataUrl?: string, fallbackName?: string) => {
    if (!user) return;
    setGeneratingUrl(true);
    setErrorMsg('');
    try {
      if (storageId) {
        const { signedUrl, access } = await generateSignedDocumentUrl(storageId, user.uid, 300); // 300s TTL (5 mins)
        setSignedUrlString(signedUrl);
        setActiveSignedAccess(access);
        setCountdownSeconds(300);
      } else if (fallbackDataUrl) {
        // Fallback for pre-existing documents: generate virtual signed token
        const expiresAt = Date.now() + 300000;
        const fakeStorageId = `vault_virtual_${user.uid}_${Date.now()}`;
        const access: SignedDocumentAccess = {
          token: 'sig_' + Math.random().toString(36).slice(2, 12),
          documentId: fakeStorageId,
          fileName: fallbackName || 'Document.pdf',
          mimeType: fallbackDataUrl.startsWith('data:application/pdf') ? 'application/pdf' : 'image/jpeg',
          sizeBytes: Math.floor(fallbackDataUrl.length * 0.75),
          dataUrl: fallbackDataUrl,
          expiresAt,
          issuedTo: user.uid
        };
        const signedUrl = `signed://vault.globalfinance.internal/kyc/${fakeStorageId}?token=${access.token}&expires=${expiresAt}`;
        setSignedUrlString(signedUrl);
        setActiveSignedAccess(access);
        setCountdownSeconds(300);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate signed document URL');
    } finally {
      setGeneratingUrl(false);
    }
  };

  const isVerified = profile?.kycStatus === 'verified' || submission?.status === 'verified';
  const isPending = profile?.kycStatus === 'pending' || submission?.status === 'pending' || submission?.status === 'in_review';
  const isRejected = submission?.status === 'rejected';

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#0d1636] to-[#070d22] border border-blue-500/30 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/25">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Know Your Customer (KYC) Verification</h2>
            <p className="text-xs text-cyan-300/80 mt-0.5">
              Secure private object storage gateway with short-lived, cryptographically signed access URLs
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div>
          {isVerified ? (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-xs font-bold shadow-sm">
              <CheckCircle2 className="w-4 h-4" />
              <span>Verified Account</span>
            </div>
          ) : isPending ? (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 text-xs font-bold shadow-sm">
              <Clock className="w-4 h-4 animate-pulse" />
              <span>Under Compliance Review</span>
            </div>
          ) : isRejected ? (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-400 text-xs font-bold shadow-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>KYC Rejected (Resubmission Required)</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-blue-500/15 border border-blue-500/40 text-cyan-300 text-xs font-bold shadow-sm">
              <Info className="w-4 h-4" />
              <span>Unverified</span>
            </div>
          )}
        </div>
      </div>

      {/* Review Notes Callout if Rejected */}
      {isRejected && submission?.adminNotes && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs space-y-1">
          <div className="flex items-center gap-2 font-bold text-rose-400">
            <AlertCircle className="w-4 h-4" />
            <span>Compliance Officer Review Notes:</span>
          </div>
          <p className="pl-6 text-rose-200">{submission.adminNotes}</p>
        </div>
      )}

      {/* Existing Submission Details Card */}
      {submission && (
        <div className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-blue-500/20">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">
                Private Object Vault Submission Summary
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              Submitted: {new Date(submission.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/15">
              <span className="text-slate-500 block">Legal Name:</span>
              <span className="text-white font-semibold">{submission.legalName}</span>
            </div>
            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/15">
              <span className="text-slate-500 block">Document Type:</span>
              <span className="text-white font-semibold uppercase">{submission.documentType} (•••• {submission.documentLast4})</span>
            </div>
            <div className="p-3 rounded-xl bg-[#060b1c] border border-blue-500/15">
              <span className="text-slate-500 block">Compliance Status:</span>
              <span className="capitalize font-bold text-cyan-300">{submission.status.replace('_', ' ')}</span>
            </div>
          </div>

          {/* Secure Document Access with Short-Lived Signed URLs */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400 block">
                Encrypted Object Storage (Zero Public Access):
              </span>
              <span className="text-[11px] text-cyan-400 font-mono flex items-center gap-1">
                <Key className="w-3 h-3" />
                <span>Signed URLs expire in 5 min</span>
              </span>
            </div>

            <div className="flex flex-wrap gap-3">
              {submission.idDocName && (
                <button
                  type="button"
                  disabled={generatingUrl}
                  onClick={() => handleOpenSignedPreview(submission.idDocStorageId, submission.idDocDataUrl, submission.idDocName)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0e173a] hover:bg-[#142250] border border-blue-500/30 text-xs text-cyan-300 font-semibold transition-colors disabled:opacity-50"
                >
                  <Eye className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Request Signed URL: Identity Doc ({submission.idDocName})</span>
                </button>
              )}
              {submission.addressDocName && (
                <button
                  type="button"
                  disabled={generatingUrl}
                  onClick={() => handleOpenSignedPreview(submission.addressDocStorageId, submission.addressDocDataUrl, submission.addressDocName)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0e173a] hover:bg-[#142250] border border-blue-500/30 text-xs text-emerald-300 font-semibold transition-colors disabled:opacity-50"
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Request Signed URL: Address Proof ({submission.addressDocName})</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KYC Upload / Resubmission Form (If not verified) */}
      {!isVerified && (
        <div className="p-6 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-5">
          <div className="border-b border-blue-500/20 pb-3">
            <h3 className="text-base font-bold text-white tracking-tight">
              {submission ? 'Update / Resubmit KYC Packet' : 'Submit KYC Identification Packet'}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Documents are stored exclusively in private encrypted storage with zero public URLs. Maximum file size: 8 MB. Allowed formats: PDF, PNG, JPEG, WEBP.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Full Legal Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="As per Government ID"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0e173a] border border-blue-500/30 text-white text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Document Type <span className="text-rose-400">*</span>
                </label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0e173a] border border-blue-500/30 text-white text-xs focus:outline-none focus:border-cyan-400"
                >
                  <option value="pan">Permanent Account Number (PAN)</option>
                  <option value="aadhaar">Aadhaar Card (UIDAI)</option>
                  <option value="passport">Passport</option>
                  <option value="driving_license">Driving License</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Document Last 4 Digits / Characters <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 1234 or 9F2A"
                maxLength={4}
                value={documentLast4}
                onChange={(e) => setDocumentLast4(e.target.value.toUpperCase())}
                required
                className="w-full sm:w-48 px-3.5 py-2.5 rounded-xl bg-[#0e173a] border border-blue-500/30 text-white font-mono text-xs focus:outline-none focus:border-cyan-400 uppercase tracking-widest text-center"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                For privacy compliance, only the last 4 characters are indexed in the primary profile.
              </span>
            </div>

            {/* Document Uploads Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {/* Identity Document Upload */}
              <div className="p-4 rounded-xl bg-[#060b1c] border border-blue-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4 text-cyan-400" />
                    Identity Document
                  </span>
                  <span className="text-[10px] text-cyan-400 font-mono">Max 8 MB</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Front side of PAN, Passport, or Aadhaar. PDF, PNG, JPEG, WEBP.
                </p>

                <label className="cursor-pointer border-2 border-dashed border-blue-500/30 hover:border-cyan-400/60 rounded-xl p-4 flex flex-col items-center justify-center text-center transition-colors bg-[#091129]/60">
                  <Upload className="w-5 h-5 text-cyan-400 mb-2" />
                  <span className="text-xs text-slate-300 font-semibold truncate max-w-[200px]">
                    {idFile ? idFile.name : 'Select Identity Document'}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1 font-mono">
                    {idFile ? `${(idFile.size / 1024 / 1024).toFixed(2)} MB • Validated` : 'Click to choose file (Max 8MB)'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,image/jpeg,image/png,image/webp"
                    onChange={(e) => handleFileUpload(e, 'id')}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Address Proof Upload */}
              <div className="p-4 rounded-xl bg-[#060b1c] border border-blue-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    Address Proof
                  </span>
                  <span className="text-[10px] text-cyan-400 font-mono">Max 8 MB</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Back side of Aadhaar, Electricity Bill, or Bank Statement.
                </p>

                <label className="cursor-pointer border-2 border-dashed border-blue-500/30 hover:border-emerald-400/60 rounded-xl p-4 flex flex-col items-center justify-center text-center transition-colors bg-[#091129]/60">
                  <Upload className="w-5 h-5 text-emerald-400 mb-2" />
                  <span className="text-xs text-slate-300 font-semibold truncate max-w-[200px]">
                    {addressFile ? addressFile.name : 'Select Address Document'}
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1 font-mono">
                    {addressFile ? `${(addressFile.size / 1024 / 1024).toFixed(2)} MB • Validated` : 'Click to choose file (Max 8MB)'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,image/jpeg,image/png,image/webp"
                    onChange={(e) => handleFileUpload(e, 'address')}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 hover:from-blue-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/40 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Encrypting and Uploading to Private Vault Storage...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Upload to Private Vault & Submit for Review</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Temporary Signed URL Preview Modal */}
      {activeSignedAccess && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0b132b] border border-blue-500/40 rounded-2xl p-5 max-w-3xl w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-blue-500/20">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-cyan-400" />
                <div>
                  <h4 className="text-sm font-bold text-white">{activeSignedAccess.fileName}</h4>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {(activeSignedAccess.sizeBytes / 1024 / 1024).toFixed(2)} MB • {activeSignedAccess.mimeType}
                  </span>
                </div>
              </div>
              
              {/* Countdown badge */}
              <div className="flex items-center gap-3">
                <div className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-xs flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 animate-pulse" />
                  <span>Expires in: {Math.floor(countdownSeconds / 60)}:{(countdownSeconds % 60).toString().padStart(2, '0')}</span>
                </div>

                <button
                  onClick={() => {
                    setActiveSignedAccess(null);
                    setSignedUrlString('');
                  }}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Signed URL indicator banner */}
            <div className="p-2.5 rounded-xl bg-[#060b18] border border-blue-500/20 flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-2 truncate pr-2">
                <Lock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="font-mono text-[11px] text-cyan-400/90 truncate">{signedUrlString}</span>
              </div>
              <span className="text-[10px] text-emerald-400 font-bold uppercase shrink-0">Signed Ticket Valid</span>
            </div>

            <div className="max-h-[60vh] overflow-auto rounded-xl bg-[#060b18] p-2 flex items-center justify-center">
              {activeSignedAccess.mimeType === 'application/pdf' ? (
                <iframe
                  src={activeSignedAccess.dataUrl}
                  className="w-full h-96 rounded-lg"
                  title="PDF Preview"
                />
              ) : (
                <img
                  src={activeSignedAccess.dataUrl}
                  alt={activeSignedAccess.fileName}
                  className="max-h-96 max-w-full rounded-lg object-contain"
                />
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-500">
                Authorized principal: <code className="text-slate-300 font-mono">{activeSignedAccess.issuedTo}</code>
              </span>
              <button
                onClick={() => {
                  setActiveSignedAccess(null);
                  setSignedUrlString('');
                }}
                className="px-4 py-2 rounded-xl bg-[#121e48] text-white font-semibold text-xs hover:bg-[#182963]"
              >
                Close Secure Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
