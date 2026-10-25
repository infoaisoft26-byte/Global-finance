import React, { useEffect, useState } from 'react';
import { Star, RefreshCw, MessageSquareText } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.tsx';

type Item = { id:number; rating:number; website_experience:string|null; transaction_experience:string|null; comment:string|null; created_at:string; name:string; email:string; referral_code:string };
export const AdminWebsiteFeedback: React.FC = () => {
 const { user } = useAuth();
 const [items,setItems] = useState<Item[]>([]);
 const [summary,setSummary] = useState<{total:number;average_rating:number|null;five_star:number}>({total:0,average_rating:0,five_star:0});
 const [loading,setLoading] = useState(true);
 const [error,setError] = useState('');
 const load = async () => {
  if(!user) return;
  setLoading(true);setError('');
  try {
   const token=await user.getIdToken();
   const r=await fetch('/api/website-feedback?admin=1',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
   const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not load reviews.');
   setItems(d.feedback||[]);setSummary(d.summary||{total:0,average_rating:0,five_star:0});
  } catch(e){setError(e instanceof Error?e.message:'Could not load reviews.');} finally{setLoading(false);}
 };
 useEffect(()=>{load();},[user]);
 return <section className="space-y-5">
  <div><p className="text-xs font-bold uppercase tracking-[.2em] text-amber-500">Member experience</p><h1 className="mt-1 text-2xl font-extrabold text-white">Website Reviews</h1><p className="mt-1 text-sm text-slate-400">Feedback submitted by Global Finance members.</p></div>
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
   {[['Total reviews',summary.total],['Average rating',summary.average_rating||'—'],['5-star reviews',summary.five_star]].map(([label,value])=><div key={String(label)} className="rounded-2xl border border-amber-400/20 bg-slate-900 p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-2xl font-extrabold text-white">{value}{label==='Average rating'&&summary.average_rating?' / 5':''}</p></div>)}
  </div>
  <div className="flex justify-end"><button onClick={load} className="flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200"><RefreshCw size={14}/> Refresh</button></div>
  {error&&<p className="rounded-xl bg-rose-950/40 p-3 text-sm text-rose-300">{error}</p>}
  {loading?<p className="p-8 text-center text-sm text-slate-400">Loading reviews…</p>:items.length===0?<div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400"><MessageSquareText className="mx-auto mb-3"/><p>No feedback submitted yet.</p></div>:<div className="space-y-3">{items.map(item=><article key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-bold text-white">{item.name||'Member'} <span className="ml-2 text-xs font-normal text-slate-400">{item.referral_code}</span></p><p className="text-xs text-slate-400">{item.email}</p></div><div className="flex items-center gap-1 text-amber-400">{Array.from({length:5},(_,i)=><Star key={i} size={15} className={i<item.rating?'fill-amber-400':'text-slate-600'}/>)}</div></div><div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400"><span className="rounded-full bg-slate-800 px-2 py-1">Website: {item.website_experience||'—'}</span><span className="rounded-full bg-slate-800 px-2 py-1">Transactions: {item.transaction_experience||'—'}</span><span className="px-2 py-1">{new Date(item.created_at).toLocaleString()}</span></div>{item.comment&&<p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-slate-950/70 p-3 text-sm text-slate-200">{item.comment}</p>}</article>)}</div>}
 </section>;
};
