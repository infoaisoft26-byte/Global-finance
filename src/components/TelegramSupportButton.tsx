import React, { useState } from 'react';
import { Send, LoaderCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

const TELEGRAM_SUPPORT_URL = 'https://t.me/GlobalFinanceHelp2026Bot';

export const TelegramSupportButton: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [connecting, setConnecting] = useState(false);

  const openTelegram = async () => {
    // Open synchronously from the click so popup blockers do not prevent Telegram from opening.
    const popup = window.open('about:blank', '_blank');
    if (popup) {
      popup.opener = null;
      popup.location.href = TELEGRAM_SUPPORT_URL;
    }

    if (!user || isAdmin || connecting) return;
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
      if (popup && !popup.closed) {
        popup.location.href = data.botUrl;
      } else {
        window.location.href = data.botUrl;
      }
    } catch (error) {
      console.error('Telegram account linking could not start:', error);
      // The standard bot chat has already been opened; users can still ask general questions.
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
      className="fixed bottom-5 right-5 z-[100] inline-flex items-center gap-2 rounded-full border border-sky-300/30 bg-[#229ED9] px-4 py-3 text-sm font-bold text-white shadow-xl shadow-sky-950/30 transition hover:-translate-y-0.5 hover:bg-[#168AC4] focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-[#070b19]"
    >
      {connecting ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />}
      <span>{connecting ? 'Connecting Telegram…' : 'Telegram Support'}</span>
    </button>
  );
};
