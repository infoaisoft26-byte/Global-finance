import React, { useState } from 'react';
import { Send, LoaderCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

const TELEGRAM_SUPPORT_URL = 'https://t.me/GlobalFinanceHelp2026Bot';

export const TelegramSupportButton: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [connecting, setConnecting] = useState(false);

  const openTelegram = async () => {
    if (connecting) return;

    // For visitors and admins, navigate directly to Telegram instead of opening
    // an about:blank popup that can remain empty when Telegram handoff is blocked.
    if (!user || isAdmin) {
      window.location.assign(TELEGRAM_SUPPORT_URL);
      return;
    }

    setConnecting(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch('/api/telegram-link-token', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.botUrl) {
        throw new Error(data?.error || 'Could not securely link your account.');
      }

      // Same-tab navigation avoids popup blockers and empty about:blank tabs.
      window.location.assign(data.botUrl);
    } catch (error) {
      console.error('Telegram account linking could not start:', error);
      // Always keep support reachable even if account linking fails.
      window.location.assign(TELEGRAM_SUPPORT_URL);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={openTelegram}
      aria-label="Open Global Finance support on Telegram"
      title="Chat with Global Finance Support on Telegram"
      className="fixed bottom-3 right-3 z-[100] inline-flex items-center gap-1.5 rounded-full border border-sky-300/30 bg-[#229ED9] px-3 py-2 text-xs font-semibold text-white shadow-md shadow-sky-950/20 transition hover:bg-[#168AC4] focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-[#070b19]"
    >
      {connecting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
      <span>{connecting ? 'Connecting…' : 'Telegram'}</span>
    </button>
  );
};
