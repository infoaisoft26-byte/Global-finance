import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext.tsx';

type Order = { id: string; user_id: string; email: string; recipient_address: string; amount_inr: string; amount_usdt: string; status: string; txid?: string; created_at: string };

export const AdminTestBuys: React.FC = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [treasury, setTreasury] = useState('');
  const [txids, setTxids] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!user) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin-test-buys', { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load test orders.');
      setOrders(data.orders); setTreasury(data.treasuryAddress);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load orders.'); }
    finally { setBusy(false); }
  }, [user]);
  useEffect(() => { void load(); }, [load]);
  const act = async (id: string, action: 'complete' | 'cancel') => {
    if (!user) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin-test-buys', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, txid: txids[id] || '' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update test order.');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update order.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5 text-slate-200"><div><h2 className="text-xl font-bold text-white">Nile Test USDT Buy Requests</h2><p className="text-sm text-amber-300 mt-1">Testnet only · send test tokens manually from the treasury account, then verify the on-chain transaction ID here.</p></div>
    <div className="rounded-xl border border-blue-500/30 bg-[#091129] p-4 text-xs"><strong>Treasury sender:</strong> <code className="text-cyan-300 break-all">{treasury || 'Not configured'}</code><p className="mt-2 text-slate-400">Use TronLink on Nile to transfer the exact amount to the displayed recipient. This page never asks for a seed phrase or private key.</p></div>
    {error && <div role="alert" className="text-rose-300">{error}</div>}
    <button onClick={() => void load()} disabled={busy} className="text-sm text-cyan-300">Refresh orders</button>
    {orders.length ? orders.map(order => <div key={order.id} className="rounded-xl border border-blue-500/20 bg-[#091129] p-4 text-sm space-y-2"><div className="flex justify-between gap-2"><strong>{order.email}</strong><span className="text-amber-300">{order.status}</span></div><div>Send <strong>{Number(order.amount_usdt).toFixed(6)} USDT-TEST</strong> for ₹{Number(order.amount_inr).toLocaleString('en-IN')} test credits</div><div className="text-xs">To: <code className="break-all text-cyan-300">{order.recipient_address}</code></div><div className="text-xs text-slate-400">{new Date(order.created_at).toLocaleString('en-IN')} · {order.id}</div>{order.status === 'pending' ? <div className="flex flex-col sm:flex-row gap-2"><input aria-label={`Nile transaction ID for ${order.id}`} className="rounded-lg border border-blue-500/30 bg-[#060b1c] p-2 flex-1" placeholder="Confirmed Nile transaction ID" value={txids[order.id] || ''} onChange={event => setTxids(prev => ({ ...prev, [order.id]: event.target.value }))}/><button disabled={busy} onClick={() => void act(order.id, 'complete')} className="rounded-lg bg-blue-600 px-3 py-2 disabled:opacity-50">Verify and complete</button><button disabled={busy} onClick={() => void act(order.id, 'cancel')} className="rounded-lg border border-rose-500/40 px-3 py-2 text-rose-300 disabled:opacity-50">Cancel and refund test credits</button></div> : order.txid && <p className="text-xs break-all">Nile TXID: {order.txid}</p>}</div>) : <p className="text-sm text-slate-400">No Nile buy requests yet.</p>}
  </div>;
};
