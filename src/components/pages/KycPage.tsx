import React, { useEffect, useState } from 'react';
import { ShieldCheck, Upload, AlertCircle, CheckCircle2, Clock, RefreshCw, FileCheck, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { submitKycDocuments, getUserKycSubmission } from '../../services/financeService.ts';
import { validateKycFile, uploadToPrivateStorage } from '../../services/storageService.ts';
import type { KycSubmission } from '../../types/index.ts';

type LocalFile = { raw: File; name: string; size: number };

const UI_TIMEOUT_MS = 35_000;
function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), UI_TIMEOUT_MS))
  ]);
}

export const KycPage: React.FC = () => {
  const { profile, user } = useAuth();
  const [submission, setSubmission] = useState<KycSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [legalName, setLegalName] = useState(profile?.name || '');
  const [documentType, setDocumentType] = useState<KycSubmission['documentType']>('pan');
  const [documentLast4, setDocumentLast4] = useState('');
  const [idFile, setIdFile] = useState<LocalFile | null>(null);
  const [addressFile, setAddressFile] = useState<LocalFile | null>(null);

  const fetchKyc = async (showSpinner = true) => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (showSpinner) setLoading(true);
    try {
      const data = await withTimeout(getUserKycSubmission(user.uid), 'KYC status request timed out. Please retry.');
      setSubmission(data);
      if (data) {
        setLegalName(data.legalName || profile?.name || '');
        setDocumentType(data.documentType);
        setDocumentLast4(data.documentLast4 || '');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load KYC status.');
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    fetchKyc();
  }, [user?.uid]);

  const pickFile = (file: File | undefined, type: 'id' | 'address') => {
    if (!file) return;
    const validation = validateKycFile(file);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Invalid file');
      return;
    }
    setErrorMsg('');
    const local = { raw: file, name: file.name, size: file.size };
    if (type === 'id') setIdFile(local); else setAddressFile(local);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || submitting) return;
    setErrorMsg('');
    setSuccessMsg('');

    if (!legalName.trim()) return setErrorMsg('Please enter your full legal name.');
    if (documentLast4.trim().length !== 4) return setErrorMsg('Please enter exactly the last 4 characters of your document.');
    if (!idFile || !addressFile) return setErrorMsg('Please select both Identity Document and Address Proof.');

    setSubmitting(true);
    try {
      // Upload both files at the same time. Large binary payloads go to Firebase Storage,
      // not Firestore documents, so the UI no longer gets stuck on oversized writes.
      const [idStorageId, addressStorageId] = await withTimeout(
        Promise.all([
          uploadToPrivateStorage(user.uid, 'identity', idFile.raw),
          uploadToPrivateStorage(user.uid, 'address', addressFile.raw)
        ]),
        'KYC upload is taking too long. Please check your internet connection and retry.'
      );

      // Store only lightweight metadata in the KYC submission record.
      await withTimeout(
        submitKycDocuments(
          user.uid,
          user.email || profile.email,
          profile.name,
          legalName.trim(),
          documentType,
          documentLast4.trim().toUpperCase(),
          { name: idFile.name, dataUrl: '', storageId: idStorageId },
          { name: addressFile.name, dataUrl: '', storageId: addressStorageId }
        ),
        'KYC submission save timed out. Please retry.'
      );

      setSuccessMsg('KYC submitted successfully. Status is Pending Review.');
      setSubmission(prev => prev ? { ...prev, status: 'pending', legalName: legalName.trim(), documentType, documentLast4: documentLast4.trim().toUpperCase() } : prev);
      setIdFile(null);
      setAddressFile(null);
      void fetchKyc(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'KYC submission failed. Please retry.');
    } finally {
      setSubmitting(false);
    }
  };

  const status = submission?.status || profile?.kycStatus || 'unverified';
  const verified = status === 'verified';
  const pending = status === 'pending' || status === 'in_review';

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="p-5 rounded-2xl bg-[#091129] border border-blue-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-600/20 border border-cyan-500/30 flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-cyan-400" /></div>
          <div>
            <h2 className="text-xl font-bold text-white">KYC Verification</h2>
            <p className="text-xs text-slate-400">Fast private document upload with timeout protection.</p>
          </div>
        </div>
        <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold ${verified ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : pending ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' : 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10'}`}>
          {verified ? 'Verified' : pending ? 'Pending Review' : status === 'rejected' ? 'Rejected' : 'Unverified'}
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" /><span className="text-xs">Loading KYC status...</span></div>
      ) : (
        <>
          {errorMsg && <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{errorMsg}</div>}
          {successMsg && <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0" />{successMsg}</div>}

          {submission && (
            <div className="p-4 rounded-2xl bg-[#091129] border border-blue-500/20 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div><span className="text-slate-500 block">Legal Name</span><strong className="text-white">{submission.legalName}</strong></div>
              <div><span className="text-slate-500 block">Document</span><strong className="text-white uppercase">{submission.documentType} •••• {submission.documentLast4}</strong></div>
              <div><span className="text-slate-500 block">Status</span><strong className="text-cyan-300 capitalize">{submission.status.replace('_', ' ')}</strong></div>
            </div>
          )}

          {!verified && (
            <form onSubmit={handleSubmit} className="p-5 sm:p-6 rounded-2xl bg-[#091129] border border-blue-500/25 space-y-5">
              <div className="flex items-start gap-2 text-xs text-slate-400"><Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />Files up to 8 MB: PDF, PNG, JPEG, WEBP. Identity and address files upload in parallel for faster submission.</div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-xs font-semibold text-slate-300 mb-1">Full Legal Name</label><input value={legalName} onChange={e => setLegalName(e.target.value)} required className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white text-xs" /></div>
                <div><label className="block text-xs font-semibold text-slate-300 mb-1">Document Type</label><select value={documentType} onChange={e => setDocumentType(e.target.value as KycSubmission['documentType'])} className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white text-xs"><option value="pan">PAN</option><option value="aadhaar">Aadhaar</option><option value="passport">Passport</option><option value="driving_license">Driving License</option></select></div>
              </div>

              <div><label className="block text-xs font-semibold text-slate-300 mb-1">Document Last 4 Characters</label><input maxLength={4} value={documentLast4} onChange={e => setDocumentLast4(e.target.value.toUpperCase())} required className="w-full sm:w-48 px-3.5 py-2.5 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white font-mono text-xs uppercase" /></div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[{ type: 'id' as const, title: 'Identity Document', file: idFile }, { type: 'address' as const, title: 'Address Proof', file: addressFile }].map(item => (
                  <label key={item.type} className="cursor-pointer p-5 rounded-xl bg-[#060b1c] border-2 border-dashed border-blue-500/30 hover:border-cyan-400/60 text-center">
                    <Upload className="w-5 h-5 text-cyan-400 mx-auto mb-2" />
                    <span className="text-xs font-bold text-white block">{item.title}</span>
                    <span className="text-[11px] text-slate-500 block mt-1">{item.file ? `${item.file.name} • ${(item.file.size / 1024 / 1024).toFixed(2)} MB` : 'Choose file'}</span>
                    <input type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={e => pickFile(e.target.files?.[0], item.type)} className="hidden" />
                  </label>
                ))}
              </div>

              <button type="submit" disabled={submitting} className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-xs disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting ? <><RefreshCw className="w-4 h-4 animate-spin" />Uploading securely...</> : <><FileCheck className="w-4 h-4" />Submit KYC for Review</>}
              </button>
            </form>
          )}

          {pending && <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex gap-2"><Clock className="w-4 h-4" />Your KYC is already queued for admin review.</div>}
        </>
      )}
    </div>
  );
};
