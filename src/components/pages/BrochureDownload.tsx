import React, { useEffect, useState } from 'react';
import { ArrowDownToLine, FileText, Loader2, RefreshCw } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase.ts';

type BrochureRecord = { fileName?: string; downloadURL?: string; sizeBytes?: number; updatedAt?: any };

export const BrochureDownload: React.FC = () => {
  const [record, setRecord] = useState<BrochureRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getDoc(doc(db, 'platformContent', 'brochure')).then(s => { if (alive) setRecord(s.exists() ? s.data() as BrochureRecord : null); }).catch(() => { if (alive) setFailed(true); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [retry]);

  return <div className="mx-auto max-w-3xl space-y-6">
    <div><div className="text-xs font-bold uppercase tracking-[.22em] text-cyan-400">Official document</div><h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">Download Brochure</h2><p className="mt-2 text-sm text-slate-400">The latest brochure uploaded by Global Finance administration.</p></div>
    <section className="overflow-hidden rounded-3xl border border-blue-400/20 bg-[#0b1430] shadow-2xl shadow-blue-950/20">
      <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500 p-6 sm:p-8"><div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10"><FileText className="h-7 w-7 text-white"/></div><h3 className="mt-5 text-2xl font-black text-white">GLOBAL FINANCE</h3><p className="mt-2 text-sm text-blue-50">Official brochure and plan information</p></div>
      <div className="p-6 sm:p-8">
        {loading ? <div className="flex items-center gap-2 py-4 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin"/>Checking latest brochure…</div> : failed ? <div className="space-y-3 text-sm text-rose-200"><p>Could not load brochure details. Please try again.</p><button onClick={() => { setFailed(false); setRetry(v => v + 1); }} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2"><RefreshCw className="h-4 w-4"/>Try again</button></div> : record?.downloadURL ? <><div className="rounded-2xl border border-white/10 bg-white/[.04] p-4"><div className="font-bold text-white">{record.fileName || 'Global Finance Brochure.pdf'}</div><div className="mt-1 text-xs text-slate-400">PDF document{record.sizeBytes ? ` · ${(record.sizeBytes / 1024 / 1024).toFixed(2)} MB` : ''}</div></div><a href={record.downloadURL} target="_blank" rel="noreferrer" download className="mt-5 flex min-h-14 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-4 text-center text-sm font-extrabold text-white shadow-lg shadow-blue-950/30 transition hover:-translate-y-0.5 hover:brightness-110"><ArrowDownToLine className="h-5 w-5"/>Download Brochure PDF</a></> : <div className="rounded-2xl border border-amber-300/20 bg-amber-300/5 p-5"><div className="font-bold text-amber-200">Brochure not uploaded yet</div><p className="mt-1 text-sm text-slate-400">The brochure will appear here as soon as the administrator uploads it.</p></div>}
      </div>
    </section>
  </div>;
};
