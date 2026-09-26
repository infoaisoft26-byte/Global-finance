import React, { useState, useEffect } from 'react';
import { 
  LifeBuoy, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  MessageSquare, 
  Clock, 
  Send,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { createSupportTicket, getSupportTickets } from '../../services/financeService.ts';
import { DataTable, type Column } from '../common/DataTable.tsx';
import type { SupportTicket } from '../../types/index.ts';

export const SupportTickets: React.FC = () => {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportTicket['category']>('deposit');
  const [priority, setPriority] = useState<SupportTicket['priority']>('normal');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadTickets = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const data = await getSupportTickets(profile.uid);
      setTickets(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [profile?.uid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    if (!subject.trim() || !message.trim()) {
      setErrorMsg('Please enter both subject and message.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const ticketId = await createSupportTicket(
        profile.uid,
        profile.email,
        profile.name,
        subject.trim(),
        category,
        priority,
        message.trim()
      );
      setSuccessMsg(`Support Ticket #${ticketId.slice(0, 8)} opened successfully! Our 24/7 helpdesk will respond shortly.`);
      setSubject('');
      setMessage('');
      setShowCreateModal(false);
      await loadTickets();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<SupportTicket>[] = [
    {
      key: 'createdAt',
      header: 'Submitted Date',
      render: (item) => (
        <span className="text-xs text-slate-300 font-mono">
          {new Date(item.createdAt).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short'
          })}
        </span>
      )
    },
    {
      key: 'id',
      header: 'Ticket ID',
      render: (item) => (
        <span className="font-mono text-cyan-400 text-xs font-semibold">
          #{item.id.slice(0, 8).toUpperCase()}
        </span>
      )
    },
    {
      key: 'subject',
      header: 'Subject & Details',
      render: (item) => (
        <div>
          <div className="text-xs font-semibold text-white">{item.subject}</div>
          <div className="text-[11px] text-slate-400 truncate max-w-xs">{item.message}</div>
          {item.adminReply && (
            <div className="mt-1 p-2 rounded bg-cyan-950/40 border border-cyan-500/30 text-[11px] text-cyan-200">
              <strong className="text-cyan-400">Desk Reply:</strong> {item.adminReply}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'category',
      header: 'Category',
      render: (item) => (
        <span className="capitalize text-xs text-slate-300">
          {item.category}
        </span>
      )
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (item) => {
        const colors = {
          low: 'text-slate-400 bg-slate-800/40',
          normal: 'text-blue-400 bg-blue-900/30',
          high: 'text-amber-400 bg-amber-900/30',
          urgent: 'text-rose-400 bg-rose-900/30'
        };
        return (
          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${colors[item.priority]}`}>
            {item.priority}
          </span>
        );
      }
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => {
        const isClosed = item.status === 'closed' || item.status === 'resolved';
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
            isClosed
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
          }`}>
            {item.status.toUpperCase()}
          </span>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-[#091129]/90 border border-blue-500/30 shadow-xl backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
            Helpdesk & Inquiries
          </span>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mt-0.5">
            Support Tickets
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            24/7 dedicated support assistance for deposits, payouts, downlines, and technical issues.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold text-xs transition-all shadow-lg shadow-cyan-900/40"
        >
          <Plus className="w-4 h-4" />
          <span>New Support Ticket</span>
        </button>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Tickets DataTable */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
            Your Support Inquiries
          </h3>
          <span className="text-xs text-slate-500">Live ticket tracker</span>
        </div>

        <DataTable
          title="Support Tickets"
          columns={columns}
          data={tickets}
          onRefresh={loadTickets}
          isLoading={loading}
          emptyMessage="No support tickets opened. Click 'New Support Ticket' to contact our team."
        />
      </div>

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b132b] border border-blue-500/30 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-blue-500/20">
              <h4 className="text-base font-bold text-white flex items-center gap-2">
                <LifeBuoy className="w-5 h-5 text-cyan-400" />
                <span>Create Support Ticket</span>
              </h4>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  placeholder="Summary of your inquiry or issue"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-white text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e: any) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-white text-xs focus:outline-none focus:border-cyan-400"
                  >
                    <option value="deposit">Deposit / Recharge</option>
                    <option value="withdrawal">Withdrawal / Payout</option>
                    <option value="package">Package Activation</option>
                    <option value="downline">Downline Team</option>
                    <option value="technical">Technical / Login</option>
                    <option value="general">General Inquiry</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e: any) => setPriority(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#0e173a] border border-blue-500/30 text-white text-xs focus:outline-none focus:border-cyan-400"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Message Description
                </label>
                <textarea
                  rows={4}
                  placeholder="Provide detailed information, transaction references or questions..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0e173a] border border-blue-500/30 text-white text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#101b3d] text-slate-300 text-xs hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs shadow-md shadow-cyan-900/40 flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Submit Ticket</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
