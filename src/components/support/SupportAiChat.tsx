import React, { useMemo, useState } from 'react';
import { Bot, MessageCircle, Send, X, Sparkles, Wallet, Package, ArrowDownToLine, ArrowUpFromLine, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const QUICK = [
  { label: 'Wallet', icon: Wallet, text: 'My wallet balance is not showing. What should I check?' },
  { label: 'Purchase', icon: Package, text: 'How do I purchase a Global Finance package?' },
  { label: 'Deposit', icon: ArrowDownToLine, text: 'How do I deposit USDT into my Global Finance wallet?' },
  { label: 'Withdrawal', icon: ArrowUpFromLine, text: 'How does withdrawal work?' },
  { label: 'OTP / Login', icon: ShieldAlert, text: 'I have an OTP or login issue. What should I do?' },
];

export const SupportAiChat: React.FC = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hi! I’m Global Finance Support AI. I can help with purchases, wallet, USDT deposits/recharges, withdrawals, OTP/login, KYC, referrals and transaction issues. How can I help?',
    },
  ]);

  const canSend = useMemo(() => Boolean(input.trim()) && !sending, [input, sending]);

  const sendMessage = async (preset?: string) => {
    const text = String(preset ?? input).trim();
    if (!text || sending) return;

    const nextMessages = [...messages, { role: 'user' as const, content: text }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    try {
      const token = user ? await user.getIdToken() : '';
      const response = await fetch('/api/usdt-recharge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'support_ai',
          messages: nextMessages.slice(-12),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Support AI is temporarily unavailable.');
      setMessages(prev => [...prev, { role: 'assistant', content: String(data?.reply || 'Please open a support ticket for further help.') }]);
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: error?.message || 'Support AI is temporarily unavailable. Please open a support ticket.' }]);
    } finally {
      setSending(false);
    }
  };

  if (!user) return null;

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 sm:right-6 z-[80] w-[calc(100vw-2rem)] sm:w-[390px] max-w-[390px] overflow-hidden rounded-2xl border border-cyan-500/30 bg-[#070d20] shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-blue-500/20 bg-[#0b1535]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center">
                <Bot className="w-5 h-5 text-cyan-300" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">Global Finance Support AI</div>
                <div className="text-[10px] text-emerald-400">Platform support only</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400" aria-label="Close support chat"><X className="w-4 h-4" /></button>
          </div>

          <div className="h-[380px] overflow-y-auto p-3 space-y-3">
            {messages.map((message, index) => (
              <div key={index} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-xs leading-5 whitespace-pre-wrap ${message.role === 'user' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-[#101a3a] border border-blue-500/15 text-slate-200 rounded-bl-md'}`}>
                  {message.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-[#101a3a] border border-blue-500/15 px-3.5 py-2.5 text-xs text-slate-400">Checking Global Finance support…</div>
              </div>
            )}
          </div>

          {messages.length === 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {QUICK.map(({ label, icon: Icon, text }) => (
                <button key={label} onClick={() => void sendMessage(text)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-blue-500/20 bg-[#0c1634] text-[10px] text-slate-300 hover:text-cyan-300 hover:border-cyan-500/30">
                  <Icon className="w-3 h-3" />{label}
                </button>
              ))}
            </div>
          )}

          <div className="p-3 border-t border-blue-500/20 flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
              placeholder="Ask about wallet, purchase, deposit, withdrawal, OTP…"
              rows={2}
              className="flex-1 resize-none rounded-xl border border-blue-500/20 bg-[#0b1430] px-3 py-2 text-xs text-white outline-none focus:border-cyan-500/50"
            />
            <button disabled={!canSend} onClick={() => void sendMessage()} className="w-10 h-10 shrink-0 rounded-xl bg-blue-600 text-white flex items-center justify-center disabled:opacity-40" aria-label="Send support message">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-5 right-4 sm:right-6 z-[79] w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 via-cyan-500 to-indigo-600 text-white shadow-xl shadow-cyan-950/40 border border-cyan-300/30 flex items-center justify-center hover:scale-105 transition-transform"
        aria-label="Open Global Finance Support AI"
        title="Global Finance Support AI"
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {!open && <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-400 border-2 border-[#070b19] flex items-center justify-center"><Sparkles className="w-2.5 h-2.5 text-slate-950" /></span>}
      </button>
    </>
  );
};
