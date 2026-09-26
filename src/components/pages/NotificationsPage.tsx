import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  CheckCheck, 
  Check, 
  RefreshCw, 
  Filter, 
  ShieldCheck, 
  ArrowLeftRight, 
  Package, 
  FileCheck, 
  LifeBuoy, 
  Lock, 
  Clock,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { 
  getUserNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead 
} from '../../services/notificationService.ts';
import type { AppNotification, NotificationCategory } from '../../types/index.ts';

export const NotificationsPage: React.FC<{ onNavigate?: (page: any) => void }> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState(false);

  const loadNotifications = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getUserNotifications(user.uid, 100);
      setNotifications(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [user?.uid]);

  const handleMarkOne = async (id: string) => {
    try {
      await markNotificationAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAll = async () => {
    if (!user) return;
    setActionLoading(true);
    try {
      await markAllNotificationsAsRead(user.uid);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = notifications.filter(n => {
    if (categoryFilter !== 'all' && n.category !== categoryFilter) return false;
    return true;
  });

  const getCategoryIcon = (category: NotificationCategory) => {
    switch (category) {
      case 'transaction':
        return <ArrowLeftRight className="w-4 h-4 text-cyan-400" />;
      case 'package':
        return <Package className="w-4 h-4 text-emerald-400" />;
      case 'kyc':
        return <FileCheck className="w-4 h-4 text-purple-400" />;
      case 'support':
        return <LifeBuoy className="w-4 h-4 text-blue-400" />;
      case 'security':
        return <Lock className="w-4 h-4 text-rose-400" />;
      default:
        return <Bell className="w-4 h-4 text-cyan-400" />;
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-blue-500/20">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Notification Center</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Audit alerts for transaction approvals, compliance verdicts, and package status changes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadNotifications}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0e173a] hover:bg-[#142250] border border-blue-500/30 text-xs font-semibold text-white transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleMarkAll}
            disabled={actionLoading || notifications.filter(n => !n.isRead).length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 border border-cyan-400/40 text-xs font-semibold text-cyan-300 transition-colors disabled:opacity-40"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark All as Read</span>
          </button>
        </div>
      </div>

      {/* Category Pills Filter */}
      <div className="flex flex-wrap gap-2">
        {['all', 'transaction', 'package', 'kyc', 'support', 'security', 'system'].map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all ${
              categoryFilter === cat
                ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                : 'bg-[#091129] text-slate-400 hover:text-slate-200 border border-blue-500/20'
            }`}
          >
            {cat} {cat === 'all' && `(${notifications.length})`}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <div className="rounded-2xl bg-[#091129] border border-blue-500/25 shadow-xl divide-y divide-blue-500/10 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            <span className="text-xs">Loading notifications...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <Bell className="w-8 h-8 mx-auto text-slate-600" />
            <p className="text-sm font-semibold text-slate-300">No notifications found</p>
            <p className="text-xs text-slate-500">You are all caught up on system updates.</p>
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.id}
              className={`p-4 transition-colors flex items-start gap-3.5 ${
                item.isRead ? 'bg-transparent' : 'bg-[#0b163a]/60 border-l-2 border-l-cyan-400'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-[#060b1c] border border-blue-500/25 flex items-center justify-center shrink-0 mt-0.5">
                {getCategoryIcon(item.category)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className={`text-xs font-bold ${item.isRead ? 'text-slate-300' : 'text-white'}`}>
                    {item.title}
                  </h4>
                  <span className="text-[10px] text-slate-500 font-mono shrink-0">
                    {new Date(item.createdAt).toLocaleDateString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>

                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  {item.message}
                </p>

                <div className="flex items-center gap-3 mt-2.5">
                  {!item.isRead && (
                    <button
                      onClick={() => handleMarkOne(item.id)}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" />
                      <span>Mark as read</span>
                    </button>
                  )}
                  {item.actionUrl && onNavigate && (
                    <button
                      onClick={() => onNavigate(item.actionUrl!.replace('/', ''))}
                      className="text-[11px] text-slate-400 hover:text-white font-semibold flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>View details</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
