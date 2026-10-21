import React from 'react';
import { Send } from 'lucide-react';

const TELEGRAM_SUPPORT_URL = 'https://t.me/GlobalFinanceHelp2026Bot';

export const TelegramSupportButton: React.FC = () => (
  <a
    href={TELEGRAM_SUPPORT_URL}
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Open Global Finance support on Telegram"
    title="Chat with Global Finance Support on Telegram"
    className="fixed bottom-5 right-5 z-[100] inline-flex items-center gap-2 rounded-full border border-sky-300/30 bg-[#229ED9] px-4 py-3 text-sm font-bold text-white shadow-xl shadow-sky-950/30 transition hover:-translate-y-0.5 hover:bg-[#168AC4] focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-[#070b19]"
  >
    <Send className="h-5 w-5" aria-hidden="true" />
    <span>Telegram Support</span>
  </a>
);
