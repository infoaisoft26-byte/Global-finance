const API = "https://api.telegram.org";

async function telegram(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram API error (${response.status})`);
  }
  return data.result;
}

async function sendMessage(chatId, text) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text: String(text).slice(0, 4000),
    disable_web_page_preview: true,
  });
}

export default async function handler(req, res) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminId = String(process.env.TELEGRAM_ADMIN_CHAT_ID || "");
  const hookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const setupKey = process.env.TELEGRAM_SETUP_KEY;

  if (!botToken || !adminId || !hookSecret) {
    return res.status(503).json({ ok: false, error: "Telegram support is not configured" });
  }

  // One-time setup endpoint: call with ?setup=1&key=<TELEGRAM_SETUP_KEY>, then remove TELEGRAM_SETUP_KEY.
  if (req.method === "GET" && req.query?.setup === "1") {
    if (!setupKey || req.query?.key !== setupKey) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
    if (!webhookUrl) {
      return res.status(503).json({ ok: false, error: "TELEGRAM_WEBHOOK_URL is not configured" });
    }
    try {
      const result = await telegram("setWebhook", {
        url: webhookUrl,
        secret_token: hookSecret,
        allowed_updates: ["message"],
        drop_pending_updates: false,
      });
      return res.status(200).json({ ok: true, webhookConfigured: result });
    } catch (error) {
      return res.status(502).json({ ok: false, error: error.message });
    }
  }

  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, service: "Global Finance Telegram Support" });
  }

  if (req.headers["x-telegram-bot-api-secret-token"] !== hookSecret) {
    return res.status(401).json({ ok: false, error: "Unauthorized webhook" });
  }

  const update = req.body;
  const message = update?.message;
  if (!message?.chat?.id) return res.status(200).json({ ok: true, ignored: true });

  const chatId = String(message.chat.id);
  const text = typeof message.text === "string" ? message.text.trim() : "";

  try {
    if (chatId === adminId) {
      if (text.startsWith("/reply ")) {
        const match = text.match(/^\/reply\s+(-?\d+)\s+([\s\S]+)$/);
        if (!match) {
          await sendMessage(adminId, "Format: /reply CHAT_ID your message");
        } else {
          await sendMessage(match[1], match[2]);
          await sendMessage(adminId, "Reply delivered to chat " + match[1] + ".");
        }
      } else if (text === "/start" || text === "/help") {
        await sendMessage(adminId, "Support admin commands:\n/reply CHAT_ID your message\n\nUser messages appear here with their chat ID. Reply only to support enquiries.");
      }
      return res.status(200).json({ ok: true });
    }

    if (message.contact) {
      await sendMessage(chatId, "For your privacy, please do not share phone contacts here. Send your support question as a text message instead.");
      return res.status(200).json({ ok: true, contactIgnored: true });
    }

    if (text === "/start") {
      await sendMessage(chatId, "Welcome to Global Finance Support. Please type your question here. Our admin will review it and reply through this bot. Do not send passwords, OTPs, or wallet private keys.");
      await sendMessage(adminId, "New support chat started.\nChat ID: " + chatId + "\nUser: " + (message.from?.username ? "@" + message.from.username : "Telegram user") + "\nUse: /reply " + chatId + " your message");
      return res.status(200).json({ ok: true });
    }

    if (!text) {
      await sendMessage(chatId, "Please send your support question as text. For privacy, do not share phone contacts, passwords, OTPs, or wallet private keys.");
      return res.status(200).json({ ok: true });
    }

    await sendMessage(chatId, "Thanks for contacting Global Finance Support. Your message has been sent to the admin. Please do not share passwords, OTPs, or wallet private keys.");
    await sendMessage(adminId, "Global Finance support message\nChat ID: " + chatId + "\nUser: " + (message.from?.username ? "@" + message.from.username : "Telegram user") + "\nMessage: " + text.slice(0, 3000) + "\n\nReply using:\n/reply " + chatId + " your message");
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Telegram support handler error:", error.message);
    return res.status(200).json({ ok: true, handled: false });
  }
}
