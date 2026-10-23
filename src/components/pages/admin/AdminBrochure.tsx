import React, { useEffect, useState } from 'react';
import { FileText, UploadCloud, CheckCircle2, AlertCircle, Download, Loader2, Link2 } from 'lucide-react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '../../../lib/firebase.ts';
import { useAuth } from '../../../context/AuthContext.tsx';

type BrochureRecord = { fileName?: string; downloadURL?: string; updatedAt?: any; sizeBytes?: number };

export const AdminBrochure: React.FC = () => {
  const { user, isAdmin, isSubAdmin } = useAuth();
  const [current, setCurrent] = useState<BrochureRecord | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'platformContent', 'brochure')).then(s => setCurrent(s.exists() ? s.data() as BrochureRecord : null)).catch(() => {});
  }, []);

  const publishDriveLink = async () => {
    if (!isAdmin || isSubAdmin || !user) { setError(true); setMessage('Only the main administrator can publish the brochure.'); return; }
    setBusy(true); setError(false); setMessage('Publishing Google Drive brochure link for members…');
    try {
      const driveURL = 'https://drive.google.com/file/d/1-gC8fieJUdibtyKmsUTYGJWB0YuVeDDE/view?usp=drive_link';
      const sizeBytes = 56870000;
      const record = {
        fileName: 'Global Finance Brochure.pdf',
        downloadURL: driveURL,
        storagePath: 'brochures/global-finance-brochure.pdf',
        size: sizeBytes,
        sizeBytes,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      };
      await setDoc(doc(db, 'platformContent', 'brochure'), record);
      setCurrent({ ...record, updatedAt: new Date() });
      setMessage('Google Drive brochure link published. Members can now open the brochure from their dashboard.');
    } catch (e) {
      setError(true);
      const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
      setMessage(code.includes('permission-denied') ? 'Firestore permission denied. Check that the updated platformContent/brochure rule is published.' : (e instanceof Error ? e.message : 'Could not publish the Google Drive link. Check Firestore permissions.'));
    } finally { setBusy(false); }
  };

  const upload = async () => {
    if (!isAdmin || isSubAdmin || !user) { setError(true); setMessage('Only the main administrator can upload the brochure.'); return; }
    if (!file) { setError(true); setMessage('Please select your PDF file first.'); return; }
    if (file.size > 64 * 1024 * 1024) { setError(true); setMessage('PDF size must be 64 MB or less.'); return; }
    if (!file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type !== 'application/pdf')) { setError(true); setMessage('Only PDF files are allowed.'); return; }
    setBusy(true); setProgress(0); setMessage('Starting upload…'); setError(false);
    try {
      const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
      if (new TextDecoder().decode(header) !== '%PDF-') throw new Error('The selected file is not a valid PDF.');
      const path = 'brochures/global-finance-brochure.pdf';
      const objectRef = ref(storage, path);
      const task = uploadBytesResumable(objectRef, file, { contentType: 'application/pdf', cacheControl: 'private, max-age=0, no-transform' });
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed', snapshot => {
          const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setProgress(percent);
          setMessage(`Uploading PDF… ${percent}%`);
        }, reject, resolve);
      });
      setMessage('Upload complete. Publishing brochure for users…');
      const downloadURL = await getDownloadURL(objectRef);
      const record = { fileName: file.name.slice(0, 160), downloadURL, storagePath: path, size: file.size, sizeBytes: file.size, updatedAt: serverTimestamp(), updatedBy: user.uid };
      await setDoc(doc(db, 'platformContent', 'brochure'), record);
      setCurrent({ ...record, updatedAt: new Date() });
      setFile(null);
      const picker = document.getElementById('gf-brochure-file') as HTMLInputElement | null;
      if (picker) picker.value = '';
      setMessage('Brochure uploaded successfully! Users can now download it from their dashboard.');
    } catch (e) {
      setError(true);
      const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
      const raw = e instanceof Error ? e.message : '';
      if (code.includes('storage/unauthorized') || code.includes('permission-denied')) {
        setMessage('Firebase permission denied. Publish the updated Storage and Firestore rules in Firebase Console, then retry.');
      } else if (code.includes('storage/canceled')) {
        setMessage('Upload was cancelled. Please try again.');
      } else if (raw) {
        setMessage(raw);
      } else {
        setMessage('Upload failed. Check Firebase Storage and Firestore permissions, then retry.');
      }
    } finally { setBusy(false); }
  };

  const dateText = current?.updatedAt?.toDate ? current.updatedAt.toDate().toLocaleString('en-IN') : current?.updatedAt instanceof Date ? current.updatedAt.toLocaleString('en-IN') : '';

  if (!isAdmin || isSubAdmin) return <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-6 text-sm text-rose-200">Only the main administrator can manage brochure uploads.</div>;

  return <div className="mx-auto max-w-3xl space-y-6">
    <div><div className="text-xs font-bold uppercase tracking-[.22em] text-cyan-400">Member resources</div><h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">Brochure PDF Management</h2><p className="mt-2 text-sm leading-6 text-slate-400">Upload your existing plan brochure. Uploading a new PDF replaces the current brochure shown to members.</p></div>
    <section className="overflow-hidden rounded-3xl border border-blue-400/20 bg-gradient-to-br from-[#101b3b] to-[#0a1127] shadow-2xl shadow-blue-950/20">
      <div className="flex items-center gap-4 border-b border-white/10 p-5 sm:p-7"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/15 text-cyan-300"><FileText className="h-7 w-7"/></div><div><h3 className="text-lg font-extrabold text-white">Official Global Finance Brochure</h3><p className="mt-1 text-xs text-slate-400">PDF only · Maximum 64 MB</p></div></div>
      <div className="space-y-5 p-5 sm:p-7">
        {current?.downloadURL && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4"><div className="min-w-0"><div className="text-xs font-bold text-emerald-300">CURRENT BROCHURE</div><div className="mt-1 break-all text-sm font-semibold text-white">{current.fileName || 'Global Finance Brochure.pdf'}</div>{dateText && <div className="mt-1 text-xs text-slate-400">Updated {dateText}</div>}</div><a href={current.downloadURL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/30 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-400/10"><Download className="h-4 w-4"/> Preview</a></div>}
        <label htmlFor="gf-brochure-file" className="block cursor-pointer rounded-2xl border-2 border-dashed border-blue-400/30 bg-blue-500/5 p-6 text-center transition hover:border-cyan-300/60 hover:bg-blue-500/10"><UploadCloud className="mx-auto h-9 w-9 text-cyan-300"/><span className="mt-3 block text-sm font-bold text-white">{file ? file.name : 'Choose brochure PDF'}</span><span className="mt-1 block text-xs text-slate-400">Click to browse your computer</span><input id="gf-brochure-file" type="file" accept=".pdf,application/pdf" className="sr-only" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
        {file && <div className="text-xs text-slate-300">Selected: {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</div>}
        {busy && <div className="space-y-2" role="status" aria-live="polite"><div className="flex items-center justify-between text-xs font-bold text-cyan-200"><span>{progress >= 100 ? 'Publishing brochure' : 'Upload progress'}</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-300 transition-all duration-200" style={{ width: `${progress}%` }}/></div><p className="text-xs text-slate-400">Please keep this page open until the brochure is published.</p></div>}
        <button onClick={publishDriveLink} disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-5 py-3 text-sm font-extrabold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"><Link2 className="h-4 w-4"/>Publish Google Drive PDF Link</button>
        <p className="text-xs leading-5 text-slate-400">Use this alternative if Firebase upload fails. The Drive file must be shared as “Anyone with the link”. Publishing this link replaces the current brochure link for members.</p>
        <button onClick={upload} disabled={busy || !file} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-blue-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{busy ? <><Loader2 className="h-4 w-4 animate-spin"/>{progress >= 100 ? 'Publishing brochure…' : `Uploading PDF… ${progress}%`}</> : <><UploadCloud className="h-4 w-4"/>{current?.downloadURL ? 'Upload / Replace Brochure' : 'Upload Brochure PDF'}</>}</button>
        {message && <div role="status" className={`flex items-start gap-2 rounded-xl p-4 text-sm font-semibold ${error ? 'bg-rose-500/10 text-rose-200' : 'bg-emerald-500/10 text-emerald-200'}`}>{error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>}<span>{message}</span></div>}
      </div>
    </section>
  </div>;
};
