import crypto from "node:crypto";
import { getPool } from "../../api/_lib/db.js";

const API = "https://api.telegram.org";
const BOT_URL = "https://t.me/GlobalFinanceHelp2026Bot";
const MENU = {
  keyboard: [
    [{ text: "💰 Wallet Balance" }, { text: "📥 Deposit" }],
    [{ text: "📊 Total Income" }],
    [{ text: "💬 Talk to Support" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Choose an option or type your question",
};

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

async function sendMessage(chatId, text, replyMarkup) {
  const payload = {
    chat_id: chatId,
    text: String(text).slice(0, 4000),
    disable_web_page_preview: true,
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return telegram("sendMessage", payload);
}

async function ensureTelegramTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telegram_link_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telegram_account_links (
      telegram_chat_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function linkTokenFromStart(text) {
  const match = String(text || "").match(/^\/start\s+link_([A-Za-z0-9_-]{20,60})$/);
  return match ? match[1] : "";
}

async function linkAccount(chatId, token) {
  const pool = getPool();
  await ensureTelegramTables(pool);
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tokenResult = await client.query(
      `SELECT t.user_id, u.status, u.role
         FROM telegram_link_tokens t
         JOIN users u ON u.id=t.user_id
        WHERE t.token_hash=$1 AND t.used_at IS NULL AND t.expires_at>NOW()
        FOR UPDATE OF t`,
      [tokenHash],
    );
    const row = tokenResult.rows[0];
    if (!row || String(row.status || "").toLowerCase() !== "active" ||
        String(row.role || "").toLowerCase() === "admin") {
      await client.query("ROLLBACK");
      return { ok: false, reason: "expired" };
    }

    await client.query(
      `INSERT INTO telegram_account_links(telegram_chat_id, user_id, linked_at)
       VALUES($1, $2, NOW())
       ON CONFLICT(user_id) DO UPDATE
         SET telegram_chat_id=EXCLUDED.telegram_chat_id, linked_at=NOW()`,
      [chatId, String(row.user_id)],
    );
    await client.query("UPDATE telegram_link_tokens SET used_at=NOW() WHERE token_hash=$1", [tokenHash]);
    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK");
    if (String(error?.code) === "23505") return { ok: false, reason: "already_linked" };
    throw error;
  } finally {
    client.release();
  }
}

async function getLinkedMember(chatId) {
  const pool = getPool();
  await ensureTelegramTables(pool);
  const result = await pool.query(
    `SELECT u.id, u.name, u.status, u.role
       FROM telegram_account_links l
       JOIN users u ON u.id=l.user_id
      WHERE l.telegram_chat_id=$1
      LIMIT 1`,
    [chatId],
  );
  const member = result.rows[0];
  if (!member || String(member.status || "").toLowerCase() !== "active" ||
      String(member.role || "").toLowerCase() === "admin") return null;
  return member;
}

async function showMenu(chatId, name) {
  await sendMessage(
    chatId,
    `Welcome${name ? " " + name : ""} to Global Finance Support. Your account is linked securely. Choose an option below to fetch your latest account details, or type a support question.\n\nFor your safety, never send passwords, OTPs, or wallet private keys.`,
    MENU,
  );
}

async function answerAccountOption(chatId, member, text) {
  const pool = getPool();
  const uid = String(member.id);
  if (text === "💰 Wallet Balance" || text.toLowerCase() === "wallet balance") {
    const result = await pool.query(
      `SELECT COALESCE(w.fund_wallet,0) AS fund_wallet,
              COALESCE(w.income_wallet,0) AS income_wallet,
              COALESCE(w.updated_at,NOW()) AS updated_at
         FROM users u LEFT JOIN wallets w ON w.user_id=u.id
        WHERE u.id=$1 AND u.status='active' LIMIT 1`,
      [uid],
    );
    if (!result.rows[0]) return sendMessage(chatId, "I couldn't load your active member wallet. Please try again later.", MENU);
    const row = result.rows[0];
    return sendMessage(
      chatId,
      `💰 Your Wallet Balance\n\nFund Wallet: ${Number(row.fund_wallet || 0).toFixed(2)} USDT\nIncome Wallet: ${Number(row.income_wallet || 0).toFixed(2)} USDT\n\nUpdated: ${new Date(row.updated_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`,
      MENU,
    );
  }

  if (text === "📥 Deposit" || text.toLowerCase() === "deposit") {
    const result = await pool.query(
      `SELECT
          COALESCE(SUM(CASE WHEN lower(status)='approved' THEN amount_usdt::numeric ELSE 0 END),0) AS approved_total,
          COALESCE(SUM(CASE WHEN lower(status) IN ('pending','submitted','review') THEN amount_usdt::numeric ELSE 0 END),0) AS pending_total,
          COUNT(*) FILTER (WHERE lower(status)='approved') AS approved_count
         FROM usdt_bep20_recharges
        WHERE user_id=$1`,
      [uid],
    );
    const row = result.rows[0] || {};
    return sendMessage(
      chatId,
      `📥 Your Deposit Summary\n\nApproved Deposits: ${Number(row.approved_total || 0).toFixed(2)} USDT\nPending Review: ${Number(row.pending_total || 0).toFixed(2)} USDT\nApproved Transactions: ${Number(row.approved_count || 0)}\n\nOnly recorded deposits are included here. On-chain transfers are not counted until the platform records them.`,
      MENU,
    );
  }

  if (text === "📊 Total Income" || text.toLowerCase() === "total income") {
    const result = await pool.query(
      `SELECT COALESCE(w.total_income,0) AS total_income,
              COALESCE(w.total_roi_income,0) + COALESCE(w.fd_total_roi_income,0) AS roi_income,
              COALESCE(w.total_level_income,0) + COALESCE(w.fd_total_level_income,0) AS level_income,
              COALESCE(w.referral_income,0) + COALESCE(w.fd_referral_income,0) AS referral_income,
              COALESCE(w.joining_bonus,0) AS joining_bonus
         FROM users u LEFT JOIN wallets w ON w.user_id=u.id
        WHERE u.id=$1 AND u.status='active' LIMIT 1`,
      [uid],
    );
    if (!result.rows[0]) return sendMessage(chatId, "I couldn't load your income summary. Please try again later.", MENU);
    const row = result.rows[0];
    return sendMessage(
      chatId,
      `📊 Your Total Income\n\nTotal Income: ${Number(row.total_income || 0).toFixed(2)} USDT\nROI Income: ${Number(row.roi_income || 0).toFixed(2)} USDT\nLevel Income: ${Number(row.level_income || 0).toFixed(2)} USDT\nReferral Income: ${Number(row.referral_income || 0).toFixed(2)} USDT\nJoining Bonus: ${Number(row.joining_bonus || 0).toFixed(2)} USDT\n\nThese values are read from your current account ledger summary.`,
      MENU,
    );
  }
  return null;
}

export default async function handler(req, res) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminId = String(process.env.TELEGRAM_ADMIN_CHAT_ID || "");
  const hookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const setupKey = process.env.TELEGRAM_SETUP_KEY;

  if (!botToken || !adminId || !hookSecret) {
    return res.status(503).json({ ok: false, error: "Telegram support is not configured" });
  }

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

  const message = req.body?.message;
  if (!message?.chat?.id) return res.status(200).json({ ok: true, ignored: true });
  const chatId = String(message.chat.id);
  const text = typeof message.text === "string" ? message.text.trim() : "";

  try {
    if (chatId === adminId) {
      if (text.startsWith("/reply ")) {
        const match = text.match(/^\/reply\s+(-?\d+)\s+([\s\S]+)$/);
        if (!match) await sendMessage(adminId, "Format: /reply CHAT_ID your message");
        else {
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

    if (text.startsWith("/start")) {
      const token = linkTokenFromStart(text);
      if (token) {
        if (message.chat.type !== "private") {
          await sendMessage(chatId, "Please link your account from a private Telegram chat.");
          return res.status(200).json({ ok: true });
        }
        const linked = await linkAccount(chatId, token);
        if (!linked.ok) {
          await sendMessage(chatId, "This account link has expired or is already used. Please log in to globalfinance1.online and tap Telegram Support again to create a fresh secure link.");
          return res.status(200).json({ ok: true });
        }
        const member = await getLinkedMember(chatId);
        await sendMessage(chatId, "✅ Your Global Finance account has been linked securely.");
        await showMenu(chatId, member?.name || "");
        return res.status(200).json({ ok: true, linked: true });
      }
      const member = await getLinkedMember(chatId);
      if (member) {
        await showMenu(chatId, member.name || "");
      } else {
        await sendMessage(chatId, "Welcome to Global Finance Support. You can ask general questions here. For private wallet, deposit, and income details, log in to https://globalfinance1.online and tap Telegram Support to securely link your active member account. Never send passwords, OTPs, or wallet private keys.");
      }
      return res.status(200).json({ ok: true });
    }

    if (!text) {
      await sendMessage(chatId, "Please send your support question as text. For privacy, do not share phone contacts, passwords, OTPs, or wallet private keys.");
      return res.status(200).json({ ok: true });
    }

    const member = await getLinkedMember(chatId);
    if (["💰 Wallet Balance", "📥 Deposit", "📊 Total Income", "wallet balance", "deposit", "total income"].includes(text.toLowerCase()) || ["💰 Wallet Balance", "📥 Deposit", "📊 Total Income"].includes(text)) {
      if (!member) {
        await sendMessage(chatId, "Account information is available only to active, linked Global Finance members. Please log in to https://globalfinance1.online and tap Telegram Support to link your account.");
        return res.status(200).json({ ok: true, accountNotLinked: true });
      }
      const result = await answerAccountOption(chatId, member, text);
      if (result) return res.status(200).json({ ok: true, accountAction: true });
    }

    if (text === "💬 Talk to Support") {
      await sendMessage(chatId, "Please type your support question in your next message. It will be sent privately to the Global Finance admin. Do not send passwords, OTPs, or wallet private keys.", MENU);
      return res.status(200).json({ ok: true });
    }

    await sendMessage(chatId, "Thanks for contacting Global Finance Support. Your message has been sent to the admin. Please do not share passwords, OTPs, or wallet private keys.");
    await sendMessage(adminId, "Global Finance support message\nChat ID: " + chatId + "\nUser: " + (message.from?.username ? "@" + message.from.username : "Telegram user") + "\nMessage: " + text.slice(0, 3000) + "\n\nReply using:\n/reply " + chatId + " your message");
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Telegram support handler error:", error instanceof Error ? error.message : error);
    try {
      await sendMessage(chatId, "Sorry, I couldn't fetch that right now. Please try again in a moment, or type your support question.");
    } catch {}
    return res.status(200).json({ ok: true, handled: false });
  }
}
