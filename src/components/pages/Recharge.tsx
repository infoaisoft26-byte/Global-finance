import React, { useCallback, useEffect, useState } from 'react';
import { Copy, RefreshCw, Wallet, AlertCircle } from 'lucide-react';

type SellOrder = { id: string; usdt: number; inr: number; status: string; txid?: string; depositAddress: string; expiresAt: string; createdAt: string };
type BuyOrder = { id: string; usdt: number; inr: number; status: string; txid?: string; address: string; createdAt: string };
type WalletResponse = { network: 'NILE'; address: string | null; onChain: { trx: number; usdt: number } | null; testBalanceInr: number; sellOrders: SellOrder[]; buyOrders: BuyOrder[] };
type TronProvider = { request: (input: { method: string }) => Promise<unknown>; tronWeb?: { defaultAddress?: { base58?: string }; fullNode?: { host?: string }; contract?: () => { at: (address: string) => Promise<{ transfer: (to: string, amount: number) => { send: (options: { feeLimit: number; callValue: number }) => Promise<string> } }> } } };
const NILE_USDT_CONTRACT = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';

declare global { interface Window { tronLink?: TronProvider } }

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}

export const Recharge: React.FC = () => {
  const [address, setAddress] = useState('');
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [amount, setAmount] = useState('1000');
  const [mode, setMode] = useState<'sell' | 'buy'>('sell');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async (publicAddress = address) => {
    setWorking(true); setError('');
    try { setWallet(await api<WalletResponse>(`/api/test-wallet${publicAddress ? `?address=${encodeURIComponent(publicAddress)}` : ''}`)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load wallet.'); }
    finally { setWorking(false); }
  }, [address]);
  useEffect(() => { void load(''); }, []);

  const connect = async () => {
    setError('');
    try {
      const provider = window.tronLink;
      if (!provider) throw new Error('Install or unlock TronLink, then select Nile Testnet.');
      const result = await provider.request({ method: 'tron_requestAccounts' });
      if (result && typeof result === 'object' && 'code' in result && result.code !== 200) throw new Error('TronLink connection was not approved.');
      const publicAddress = provider.tronWeb?.defaultAddress?.base58 || '';
      const node = provider.tronWeb?.fullNode?.host || '';
      if (!node.includes('nile.trongrid.io')) throw new Error('Select Nile Testnet in TronLink before connecting.');
      if (!publicAddress) throw new Error('No public address received from TronLink.');
      setAddress(publicAddress);
      await load(publicAddress);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not connect TronLink.'); }
  };

  const submit = async () => {
    setWorking(true); setError(''); setMessage('');
    try {
      const amountInr = Number(amount);
      if (!Number.isFinite(amountInr) || amountInr < 100 || amountInr > 500000) throw new Error('Enter ₹100–₹5,00,000 in test credits.');
      if (mode === 'buy') {
        if (!address) throw new Error('Connect your Nile TronLink wallet first.');
        const result = await api<{ order: { amountUsdt: number }; message: string }>('/api/test-buy-order', { method: 'POST', body: JSON.stringify({ amountInr, address }) });
        setMessage(`Buy request saved for ${result.order.amountUsdt} test USDT. Treasury transfer is pending verification.`);
      } else {
        const result = await api<{ intent: { expectedAmountUsdt: number } }>('/api/crypto-deposit-intent', { method: 'POST', body: JSON.stringify({ amountInr }) });
        setMessage(`Sell request ready: send exactly ${result.intent.expectedAmountUsdt.toFixed(6)} Nile test USDT to the address below.`);
      }
      await load(address);
    } catch (err) { setError(err instanceof Error ? err.message : 'Request failed.'); }
    finally { setWorking(false); }
  };

  const checkSell = async () => {
    setWorking(true); setError('');
    try {
      const result = await api<{ credited: boolean; message?: string }>('/api/crypto-deposit-sync', { method: 'POST', body: '{}' });
      setMessage(result.credited ? 'Nile transfer confirmed. Test credits added to your test wallet.' : (result.message || 'Still waiting for a confirmed transfer.'));
      await load(address);
    } catch (err) { setError(err instanceof Error ? err.message : 'Confirmation check failed.'); }
    finally { setWorking(false); }
  };

  const sendSell = async (order: SellOrder) => {
    setError(''); setMessage(''); setWorking(true);
    try {
      const tronWeb = window.tronLink?.tronWeb;
      if (!address || tronWeb?.defaultAddress?.base58 !== address || !tronWeb.fullNode?.host?.includes('nile.trongrid.io')) throw new Error('Connect the same wallet on Nile Testnet before sending.');
      if (order.depositAddress === address) throw new Error('The connected wallet cannot send test tokens to itself as a sell order.');
      if ((wallet?.onChain?.usdt || 0) < order.usdt) throw new Error('Not enough Nile test USDT in this wallet.');
      if (!tronWeb.contract) throw new Error('TronLink contract support is unavailable. Send manually from TronLink instead.');
      const contract = await tronWeb.contract().at(NILE_USDT_CONTRACT);
      const txid = await contract.transfer(order.depositAddress, Math.round(order.usdt * 1e6)).send({ feeLimit: 100_000_000, callValue: 0 });
      setMessage(`Nile transaction submitted: ${txid}. Use Check confirmation after it is confirmed on chain.`);
      await load(address);
    } catch (err) { setError(err instanceof Error ? err.message : 'TronLink transfer failed.'); }
    finally { setWorking(false); }
  };

  const activeSell = wallet?.sellOrders.find(item => item.status === 'pending' && new Date(item.expiresAt).getTime() > Date.now());
  useEffect(() => {
    if (!activeSell) return;
    const timer = window.setInterval(async () => {
      try {
        const result = await api<{ credited: boolean }>('/api/crypto-deposit-sync', { method: 'POST', body: '{}' });
        if (result.credited) { setMessage('Nile transfer confirmed. Test credits added automatically.'); await load(address); }
      } catch { /* Keep the order visible; the member can retry manually. */ }
    }, 12000);
    return () => window.clearInterval(timer);
  }, [activeSell?.id, address, load]);
  useEffect(() => {
    if (!wallet?.buyOrders.some(item => item.status === 'pending')) return;
    const timer = window.setInterval(() => { void load(address); }, 30000);
    return () => window.clearInterval(timer);
  }, [wallet?.buyOrders.some(item => item.status === 'pending'), address, load]);
  const latestOrders = [...(wallet?.buyOrders || []).map(item => ({ ...item, side: 'Buy' })), ...(wallet?.sellOrders || []).map(item => ({ ...item, side: 'Sell' }))].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8);

  return <div className="space-y-5 text-slate-200">
    <div className="flex items-start justify-between gap-3 flex-wrap border-b border-blue-500/20 pb-4">
      <div><h2 className="text-xl font-bold text-white">Nile Test Wallet & Trading</h2><p className="text-xs text-amber-300 mt-1">TESTNET ONLY · Test tokens and test credits have no cash value.</p></div>
      <div className="flex gap-2"><button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={connect}>Connect TronLink</button><button onClick={() => void load(address)} disabled={working} className="rounded-xl border border-blue-500/30 px-3 py-2 text-sm disabled:opacity-50" aria-label="Refresh Nile balances"><RefreshCw size={16}/></button></div>
    </div>
    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-xl border border-blue-500/25 bg-[#091129] p-4"><p className="text-xs text-slate-400">Your Nile TRX on chain</p><p className="mt-2 text-2xl font-bold">{wallet?.onChain ? wallet.onChain.trx.toLocaleString() : '—'} <span className="text-sm">TRX</span></p></div>
      <div className="rounded-xl border border-blue-500/25 bg-[#091129] p-4"><p className="text-xs text-slate-400">Your Nile USDT on chain</p><p className="mt-2 text-2xl font-bold">{wallet?.onChain ? wallet.onChain.usdt.toLocaleString() : '—'} <span className="text-sm">USDT-TEST</span></p></div>
      <div className="rounded-xl border border-blue-500/25 bg-[#091129] p-4"><p className="text-xs text-slate-400">Platform test credits</p><p className="mt-2 text-2xl font-bold">₹{(wallet?.testBalanceInr || 0).toLocaleString('en-IN')}</p><p className="mt-1 text-[11px] text-amber-300">Separate from real Fund Wallet</p></div>
    </div>
    {address && <div className="rounded-xl border border-blue-500/25 bg-[#091129] p-3 text-xs">Connected public address: <span className="font-mono text-cyan-300 break-all">{address}</span> <button className="ml-2 text-cyan-400" onClick={() => navigator.clipboard.writeText(address)} aria-label="Copy address"><Copy size={14}/></button></div>}
    {error && <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-3 text-sm text-rose-200 flex gap-2"><AlertCircle size={18}/>{error}</div>}
    {message && <div role="status" className="rounded-xl border border-cyan-500/40 bg-cyan-950/20 p-3 text-sm text-cyan-100">{message}</div>}
    <div className="rounded-2xl border border-blue-500/25 bg-[#091129] p-5 space-y-4">
      <div className="flex gap-2"><button onClick={() => setMode('sell')} className={`px-4 py-2 rounded-lg text-sm ${mode === 'sell' ? 'bg-cyan-600 text-white' : 'bg-[#151e3b]'}`}>Sell test USDT</button><button onClick={() => setMode('buy')} className={`px-4 py-2 rounded-lg text-sm ${mode === 'buy' ? 'bg-cyan-600 text-white' : 'bg-[#151e3b]'}`}>Buy test USDT</button></div>
      <p className="text-xs text-slate-400">{mode === 'sell' ? 'Send test USDT from your Nile wallet. Confirmed transfer credits your separate test balance.' : 'Spend test credits. The treasury must send test USDT to your connected Nile address; the order stays pending until that transfer is verified.'}</p>
      <label className="block text-sm">Amount in test credits (₹)<input type="number" min="100" max="500000" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} className="mt-2 block w-full max-w-xs rounded-xl border border-blue-500/30 bg-[#060b1c] p-3 text-white" /></label>
      <button disabled={working || (mode === 'buy' && !address)} onClick={submit} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{working ? 'Please wait…' : mode === 'sell' ? 'Create sell request' : 'Request test USDT buy'}</button>
      {activeSell && <div className="rounded-xl border border-amber-500/30 bg-[#060b1c] p-4 space-y-2 text-sm"><strong className="text-amber-300">Pending sell · expires {new Date(activeSell.expiresAt).toLocaleString('en-IN')}</strong><p>Send exactly <strong>{activeSell.usdt.toFixed(6)} USDT-TEST</strong> on Nile to:</p><div className="flex gap-2 items-center"><code className="break-all text-cyan-300">{activeSell.depositAddress}</code><button onClick={() => navigator.clipboard.writeText(activeSell.depositAddress)} aria-label="Copy deposit address"><Copy size={16}/></button></div><p className="text-xs text-amber-200">Check the Nile network, token, address and exact amount in TronLink before signing. Never enter a seed phrase here.</p><div className="flex gap-2 flex-wrap"><button disabled={working || !address || address === activeSell.depositAddress} onClick={() => void sendSell(activeSell)} className="rounded-lg bg-blue-600 px-3 py-2 text-white disabled:opacity-50">Send with TronLink</button><button disabled={working} onClick={checkSell} className="rounded-lg border border-cyan-500/40 px-3 py-2 text-cyan-300 flex items-center gap-2 disabled:opacity-50"><RefreshCw size={15}/> Check confirmation</button></div></div>}
    </div>
    <div className="rounded-2xl border border-blue-500/25 bg-[#091129] p-5"><h3 className="font-semibold text-white mb-3 flex gap-2 items-center"><Wallet size={17}/> Recent test orders</h3>{latestOrders.length ? <div className="space-y-2">{latestOrders.map(item => <div key={item.id} className="flex flex-wrap justify-between gap-2 border-b border-blue-500/10 py-2 text-xs"><span>{item.side} {item.usdt.toFixed(6)} USDT-TEST · ₹{item.inr.toLocaleString('en-IN')}</span><span className="text-cyan-300">{item.status}{item.txid ? ` · ${item.txid.slice(0, 12)}…` : ''}</span></div>)}</div> : <p className="text-xs text-slate-400">No test orders yet.</p>}</div>
  </div>;
};
