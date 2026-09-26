import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Search, 
  MessageSquare, 
  CheckCircle2, 
  Send, 
  RefreshCw, 
  ChevronRight, 
  User, 
  X,
  AlertCircle
} from 'lucide-react';
import { 
  getSupportTickets, 
  addTicketReply 
} from '../../../services/financeService.ts';
import { useAuth } from '../../../context/AuthContext.tsx';
import type { SupportTicket } from '../../../types/index.ts';

export const AdminTickets: React.FC = () => {
  const { user: currentAdmin, profile } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'in_progress' | 'closed'>('all');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  // Reply form
  const [replyText, setReplyText] = useState('');
  const [newStatus, setNewStatus] = useState<SupportTicket['status']>('in_progress');
  const [sendingReply, setSendingReply] = useState(false);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const data = await getSupportTickets(); // load all tickets
      setTickets(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !currentAdmin || !replyText.trim()) return;

    setSendingReply(true);
    try {
      await addTicketReply(
        selectedTicket.id,
        currentAdmin.uid,
        'admin',
        profile?.name || 'Compliance Admin Desk',
        replyText.trim(),
        newStatus
      );
      setReplyText('');
      await loadTickets();
      // Update selected ticket in view
      const updated = tickets.find(t => t.id === selectedTicket.id);
      if (updated) {
        setSelectedTicket({
          ...updated,
          status: newStatus,
          adminReply: replyText.trim()
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSendingReply(false);
    }
  };

  const filtered = tickets.filter(t => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'closed') {
        return t.status === 'closed' || t.status === 'resolved';
      }
      return t.status === statusFilter;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Support Desk & Inquiries</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Resolve member helpdesk inquiries, record official desk responses, and adjust ticket lifecycles.
          </p>
        </div>

        <button
          onClick={loadTickets}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#0e173a] hover:bg-[#142250] border border-blue-500/30 text-xs font-semibold text-white transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Tickets</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-[#091129] border border-blue-500/25 rounded-2xl w-fit">
        {(['all', 'open', 'in_progress', 'closed'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all capitalize ${
              statusFilter === tab
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Tickets List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-3">
          {loading ? (
            <div className="py-12 text-center text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-cyan-400 mb-2" />
              <span className="text-xs">Loading ticket queue...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs bg-[#091129] rounded-2xl border border-blue-500/20">
              No tickets found in this view.
            </div>
          ) : (
            filtered.map((t) => {
              const isSelected = selectedTicket?.id === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => {
                    setSelectedTicket(t);
                    setNewStatus(t.status);
                  }}
                  className={`cursor-pointer p-4 rounded-2xl border transition-all text-left space-y-2 ${
                    isSelected
                      ? 'bg-[#101b44] border-cyan-400/60 shadow-lg shadow-cyan-950/40'
                      : 'bg-[#091129] border-blue-500/20 hover:border-cyan-500/40 hover:bg-[#0c1638]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-cyan-400 text-xs font-bold">
                      #{t.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      t.status === 'open'
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : t.status === 'in_progress'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-slate-700 text-slate-300'
                    }`}>
                      {t.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="text-xs font-bold text-white line-clamp-1">{t.subject}</div>
                  <div className="text-[11px] text-slate-400 line-clamp-2">{t.message}</div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1">
                    <span>{t.userEmail}</span>
                    <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Ticket Thread & Reply Box */}
        <div className="lg:col-span-2">
          {selectedTicket ? (
            <div className="p-6 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl space-y-5">
              <div className="flex items-start justify-between pb-3 border-b border-blue-500/20">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-cyan-400 font-bold text-xs">
                      #{selectedTicket.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className="capitalize px-2 py-0.5 rounded bg-blue-500/20 text-cyan-300 text-[10px] font-bold">
                      {selectedTicket.category}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1">{selectedTicket.subject}</h3>
                  <div className="text-xs text-slate-400 mt-0.5">
                    User: {selectedTicket.userName || selectedTicket.userEmail} ({selectedTicket.userEmail})
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-500 font-mono">
                  {new Date(selectedTicket.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </div>

              {/* Message History */}
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {/* Original ticket message */}
                <div className="p-4 rounded-xl bg-[#060b1c] border border-blue-500/15 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-bold text-cyan-400">{selectedTicket.userName || 'Member'}</span>
                    <span className="font-mono text-[10px] text-slate-500">Original Inquiry</span>
                  </div>
                  <p className="text-xs text-slate-200 whitespace-pre-wrap">{selectedTicket.message}</p>
                </div>

                {/* Sub-messages if present */}
                {selectedTicket.messages?.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-3.5 rounded-xl text-xs space-y-1 ${
                      msg.senderRole === 'admin'
                        ? 'bg-[#0f1d48] border border-cyan-500/30 ml-4'
                        : 'bg-[#060b1c] border border-blue-500/15 mr-4'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-bold ${msg.senderRole === 'admin' ? 'text-cyan-300' : 'text-slate-300'}`}>
                        {msg.senderName} {msg.senderRole === 'admin' && '(Helpdesk Desk)'}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-slate-200 whitespace-pre-wrap">{msg.message}</p>
                  </div>
                ))}
              </div>

              {/* Reply & Status Form */}
              <form onSubmit={handleSendReply} className="pt-3 border-t border-blue-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">Desk Response:</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400">Set Ticket Status:</span>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value as any)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
                    >
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                      <option value="open">Open</option>
                    </select>
                  </div>
                </div>

                <textarea
                  rows={3}
                  placeholder="Type official response to user..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={sendingReply || !replyText.trim()}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {sendingReply ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending Response...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Submit Desk Reply</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-8 rounded-2xl bg-[#091129] border border-blue-500/20 text-center text-slate-500">
              <MessageSquare className="w-8 h-8 text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-400">Select a ticket to review thread</p>
              <p className="text-xs text-slate-500 mt-1">Choose any inquiry from the left panel to inspect and reply.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
