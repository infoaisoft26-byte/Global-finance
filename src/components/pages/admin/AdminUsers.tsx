import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Filter, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  UserCheck, 
  UserX,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  Shield,
  Clock
} from 'lucide-react';
import { 
  adminGetAllUsers, 
  adminSetUserStatus 
} from '../../../services/financeService.ts';
import { useAuth } from '../../../context/AuthContext.tsx';
import type { UserProfile, ActivePage } from '../../../types/index.ts';

interface AdminUsersProps {
  onSelectUser: (userId: string) => void;
}

export const AdminUsers: React.FC<AdminUsersProps> = ({ onSelectUser }) => {
  const { user: currentAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [kycFilter, setKycFilter] = useState<'all' | 'verified' | 'pending' | 'unverified' | 'rejected'>('all');
  
  // Status action modal
  const [actionUser, setActionUser] = useState<UserProfile | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [processingAction, setProcessingAction] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await adminGetAllUsers();
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleToggleStatus = async () => {
    if (!actionUser || !currentAdmin) return;
    setProcessingAction(true);
    setActionError('');
    try {
      const newStatus = actionUser.status === 'suspended' ? 'active' : 'suspended';
      await adminSetUserStatus(currentAdmin.uid, actionUser.uid, newStatus, actionReason);
      setActionUser(null);
      setActionReason('');
      await loadUsers();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update user status');
    } finally {
      setProcessingAction(false);
    }
  };

  // Filter users
  const filteredUsers = users.filter(u => {
    if (statusFilter !== 'all') {
      const actualStatus = u.status || 'active';
      if (actualStatus !== statusFilter) return false;
    }
    if (kycFilter !== 'all') {
      const actualKyc = u.kycStatus || 'unverified';
      if (actualKyc !== kycFilter) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.referralCode.toLowerCase().includes(q) ||
        (u.sponsorId && u.sponsorId.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Real User Management</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Search, inspect ledger breakdowns, team structures, and manage account statuses.
          </p>
        </div>

        <button
          onClick={loadUsers}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#0e173a] hover:bg-[#142250] border border-blue-500/30 text-xs font-semibold text-white transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Users</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-[#091129] border border-blue-500/25 shadow-lg space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, email, member ID (GF...)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* Account Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 shrink-0">Account:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="all">All Statuses ({users.length})</option>
              <option value="active">Active Only</option>
              <option value="suspended">Suspended Only</option>
            </select>
          </div>

          {/* KYC Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 shrink-0">KYC:</span>
            <select
              value={kycFilter}
              onChange={(e) => setKycFilter(e.target.value as any)}
              className="px-3 py-2 text-xs rounded-xl bg-[#060b1c] border border-blue-500/30 text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="all">All KYC</option>
              <option value="verified">Verified</option>
              <option value="pending">Pending</option>
              <option value="unverified">Unverified</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table / Grid */}
      <div className="rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            <span className="text-xs">Querying PostgreSQL / Firestore users...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <Users className="w-8 h-8 mx-auto text-slate-500 opacity-60" />
            <p className="text-sm font-semibold text-slate-300">No users match filter criteria</p>
            <p className="text-xs text-slate-500">Try adjusting your search terms or filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#060b1c] border-b border-blue-500/20 text-slate-400 uppercase tracking-wider font-mono text-[10px]">
                <tr>
                  <th className="py-3 px-4">Member Info</th>
                  <th className="py-3 px-4">Member Code</th>
                  <th className="py-3 px-4">Sponsor ID</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">KYC</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Joined Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-500/10">
                {filteredUsers.map((u) => {
                  const isSusp = u.status === 'suspended';
                  return (
                    <tr key={u.uid} className="hover:bg-[#0e173a]/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white text-xs">{u.name}</div>
                        <div className="text-[11px] text-slate-400">{u.email}</div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-cyan-400">
                        {u.referralCode}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {u.sponsorId || '—'}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-mono ${
                          u.role === 'admin' 
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' 
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        }`}>
                          {u.role}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {u.kycStatus === 'verified' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Verified</span>
                          </span>
                        ) : u.kycStatus === 'pending' || u.kycStatus === 'in_review' ? (
                          <span className="inline-flex items-center gap-1 text-amber-400 font-semibold text-[11px]">
                            <Clock className="w-3.5 h-3.5 animate-pulse" />
                            <span>Pending</span>
                          </span>
                        ) : u.kycStatus === 'rejected' ? (
                          <span className="inline-flex items-center gap-1 text-rose-400 font-semibold text-[11px]">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Rejected</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">Unverified</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {isSusp ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">
                            Suspended
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                            Active
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                        {new Date(u.createdAt).toLocaleDateString('en-IN', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </td>

                      <td className="py-3.5 px-4 text-right space-x-1.5">
                        <button
                          onClick={() => onSelectUser(u.uid)}
                          className="px-2.5 py-1 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-cyan-300 font-semibold text-xs transition-colors inline-flex items-center gap-1 border border-cyan-500/30"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Inspect</span>
                        </button>

                        {u.role !== 'admin' && (
                          <button
                            onClick={() => { setActionUser(u); setActionReason(''); }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1 border ${
                              isSusp 
                                ? 'bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border-emerald-500/40' 
                                : 'bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border-rose-500/40'
                            }`}
                          >
                            {isSusp ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                            <span>{isSusp ? 'Reactivate' : 'Suspend'}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Suspend / Reactivate Confirmation Modal */}
      {actionUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b132b] border border-blue-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-base font-bold text-white">
              {actionUser.status === 'suspended' ? (
                <UserCheck className="w-5 h-5 text-emerald-400" />
              ) : (
                <UserX className="w-5 h-5 text-rose-400" />
              )}
              <span>
                {actionUser.status === 'suspended' ? 'Reactivate User Account' : 'Suspend User Account'}
              </span>
            </div>

            <p className="text-xs text-slate-300">
              Target Member: <strong className="text-white">{actionUser.name}</strong> ({actionUser.referralCode})
              <br />
              {actionUser.status === 'suspended' 
                ? 'Reactivating will restore dashboard login access and transactional abilities.'
                : 'Suspension immediately blocks login access and prevents any withdrawals or transfers.'}
            </p>

            {actionError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
                {actionError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Audit Reason (Mandatory)
              </label>
              <textarea
                rows={2}
                placeholder="Specify the regulatory or security reason for this action..."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#060b1c] border border-blue-500/30 text-white text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionUser(null)}
                className="px-4 py-2 rounded-xl bg-[#101b3d] text-slate-300 text-xs hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={processingAction || !actionReason.trim()}
                onClick={handleToggleStatus}
                className={`px-5 py-2 rounded-xl font-bold text-xs text-white shadow-md transition-colors disabled:opacity-50 ${
                  actionUser.status === 'suspended'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {processingAction ? 'Auditing & Updating...' : actionUser.status === 'suspended' ? 'Confirm Reactivation' : 'Confirm Suspension'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
