import { GoogleGenAI } from '@google/genai';
import { getPool } from './_lib/db.js';
import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  return res.end(JSON.stringify(body));
}

function safeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function money(value) {
  return `$ ${safeNumber(value).toFixed(2)} USDT`;
}

function fallbackReply(question, account) {
  const q = String(question || '').toLowerCase();
  const wallet = account.wallet;
  if (/wallet|balance|fund wallet|income wallet|available balance|paise|amount showing|balance show/.test(q)) {
    if (!wallet) return 'I could not load your wallet record right now. Please refresh once. If the balance is still missing, open a Support Ticket under Technical / Login and include your Member ID. I have not changed your balance.';
    return `I checked your account records.\\n• Fund Wallet: ${money(wallet.fundWallet)}\\n• Income Wallet: ${money(wallet.incomeWallet)}\\n• Total income recorded: ${money(wallet.totalIncome)}\\n• Total withdrawals recorded: ${money(wallet.totalWithdrawal)}\\n\\nIf your dashboard shows a different amount, do not deposit again just to test it. Refresh the page and open a Support Ticket if the mismatch remains.`;
  }
  if (/deposit|recharge|txid|tx hash|transaction hash|pending|approved|rejected/.test(q)) {
    const list = account.recharges || [];
    if (!list.length) return 'I could not find a recent USDT recharge request in the available records. If you have already sent USDT, do not send it again. Open Recharge and check your submitted TX hash; if it is missing, create a Deposit / Recharge support ticket with the TX hash and amount.';
    return 'Here are your latest USDT deposit requests from the account records:\\n' + list.map((x, i) => `${i + 1}. ${x.amountUsdt} USDT — status: ${x.status}${x.txHash ? `, TX: ${x.txHash.slice(0, 12)}…` : ''}${x.reviewNote ? `, note: ${x.reviewNote}` : ''}`).join('\\n') + '\\n\\nIf a deposit is pending, wait for admin review and do not submit the same TX hash again. If it is approved but the wallet is unchanged, open a ticket and include the TX hash.';
  }
  if (/withdraw|payout|withdrawal/.test(q)) {
    const withdrawals = (account.ledger || []).filter(x => /withdraw/i.test(x.type + ' ' + x.description)).slice(0, 5);
    if (!withdrawals.length) return 'I could not find a recent completed withdrawal in your ledger. To check a pending or rejected request, open Support Tickets and submit a Withdrawal / Payout ticket with the request reference. I cannot approve or reject withdrawals from chat.';
    return 'Your latest withdrawal-related ledger entries:\\n' + withdrawals.map((x, i) => `${i + 1}. ${money(x.amount)} — ${x.status} — ref ${x.referenceId || x.id}`).join('\\n') + '\\n\\nFor a pending request, open a Withdrawal / Payout support ticket with its reference.';
  }
  return 'I can help check your wallet, deposits/recharges, withdrawals, package activation, login and account issues. Tell me which issue you are facing, or tap Wallet / Deposit above. For a case that needs staff action, open Support Tickets and include the transaction reference. I cannot change balances or approve transactions from chat.';
}

async function getAccountContext(uid) {
  const pool = getPool();
  const userQ = await pool.query(
    'SELECT id,name,email,referral_code,status,role FROM users WHERE id=$1 LIMIT 1',
    [uid]
  );
  const user = userQ.rows[0];
  if (!user || user.role !== 'user' || user.status !== 'active') throw new Error('ACTIVE_MEMBER_REQUIRED');

  let wallet = null;
  try {
    const w = await pool.query(
      'SELECT fund_wallet,income_wallet,total_income,total_withdrawal,basic_package_active,fd_package_active,updated_at FROM wallets WHERE user_id=$1 LIMIT 1',
      [uid]
    );
    if (w.rows[0]) {
      const row = w.rows[0];
      wallet = {
        fundWallet: safeNumber(row.fund_wallet),
        incomeWallet: safeNumber(row.income_wallet),
        totalIncome: safeNumber(row.total_income),
        totalWithdrawal: safeNumber(row.total_withdrawal),
        basicPackageActive: safeNumber(row.basic_package_active),
        fdPackageActive: safeNumber(row.fd_package_active),
        updatedAt: row.updated_at || null,
      };
    }
  } catch (error) {
    console.warn('Support AI wallet context unavailable:', error instanceof Error ? error.message : error);
  }

  let recharges = [];
  try {
    const q = await pool.query(
      'SELECT id,amount_usdt,status,tx_hash,review_note,created_at,reviewed_at FROM usdt_bep20_recharges WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5',
      [uid]
    );
    recharges = q.rows.map(row => ({
      id: String(row.id),
      amountUsdt: String(row.amount_usdt ?? '0'),
      status: String(row.status || 'unknown'),
      txHash: String(row.tx_hash || ''),
      reviewNote: String(row.review_note || ''),
      createdAt: row.created_at || null,
      reviewedAt: row.reviewed_at || null,
    }));
  } catch (error) {
    console.warn('Support AI recharge context unavailable:', error instanceof Error ? error.message : error);
  }

  let ledger = [];
  try {
    const q = await pool.query(
      'SELECT id,type,category,flow,amount,fee,net_amount,description,reference_id,status,created_at FROM ledger_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 15',
      [uid]
    );
    ledger = q.rows.map(row => ({
      id: String(row.id),
      type: String(row.type || ''),
      category: String(row.category || ''),
      flow: String(row.flow || ''),
      amount: safeNumber(row.amount),
      fee: safeNumber(row.fee),
      netAmount: safeNumber(row.net_amount),
      description: String(row.description || ''),
      referenceId: String(row.reference_id || ''),
      status: String(row.status || ''),
      createdAt: row.created_at || null,
    }));
  } catch (error) {
    console.warn('Support AI ledger context unavailable:', error instanceof Error ? error.message : error);
  }

  return {
    member: { memberId: String(user.referral_code || ''), name: String(user.name || 'Member') },
    wallet,
    recharges,
    ledger,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const auth = String(req.headers.authorization || '');
    if (!auth.startsWith('Bearer ')) return json(res, 401, { error: 'Please sign in to use account support.' });
    let decoded;
    try {
      decoded = await verifyFirebaseIdToken(auth.slice(7));
    } catch {
      return json(res, 401, { error: 'Your session expired. Please sign in again.' });
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const incoming = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    const messages = incoming
      .filter(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
      .map(item => ({ role: item.role, content: item.content.slice(0, 1200) }));
    const latestQuestion = [...messages].reverse().find(item => item.role === 'user')?.content || '';
    if (!latestQuestion.trim()) return json(res, 400, { error: 'Type a question first.' });

    const account = await getAccountContext(String(decoded.uid || ''));
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '';
    if (!apiKey) {
      return json(res, 200, { reply: fallbackReply(latestQuestion, account), source: 'account-records' });
    }

    const systemInstruction = [
      'You are Global Finance Support AI, the signed-in member help assistant.',
      'Answer only questions about Global Finance: account, wallet, deposit/recharge, withdrawal, package activation, referrals, OTP/login, transactions and support tickets.',
      'Use the ACCOUNT DATA supplied below as the authoritative source for this member. Quote exact wallet balances only from that data. If a value is null or a record is missing, say it could not be found; never guess.',
      'For deposit questions, explain the listed recharge statuses exactly. A pending status means awaiting review, approved means the request was approved, and rejected means it was rejected; do not claim the funds were credited unless the account wallet/ledger data proves it.',
      'Never claim you have changed a balance, approved/rejected a deposit or withdrawal, activated a package, or opened a ticket. Chat is read-only.',
      'Never ask for passwords, OTP values, private keys, seed phrases or API keys. Never reveal another member data.',
      'If dashboard and account data conflict, advise refreshing once and opening a support ticket with the reference; do not tell the user to deposit again.',
      'Be concise, kind, and answer in the language used by the member, including Hindi/Hinglish. For unresolved issues, tell them to open Support Tickets in the app.',
      'ACCOUNT DATA: ' + JSON.stringify(account),
    ].join(' ');

    const ai = new GoogleGenAI({ apiKey });
    const contents = messages.map(item => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: item.content }],
    }));
    let reply = '';
    try {
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        contents,
        config: { systemInstruction, temperature: 0.2, maxOutputTokens: 600 },
      });
      reply = String(response.text || '').trim();
    } catch (error) {
      console.error('Support AI provider unavailable:', error instanceof Error ? error.message : error);
      reply = fallbackReply(latestQuestion, account);
    }
    return json(res, 200, { reply: reply || fallbackReply(latestQuestion, account), source: reply ? 'ai' : 'account-records' });
  } catch (error) {
    const message = String(error?.message || '');
    if (message === 'ACTIVE_MEMBER_REQUIRED') return json(res, 403, { error: 'Active member account required.' });
    console.error('Support AI request failed:', message || error);
    return json(res, 500, { error: 'Support is temporarily unavailable. Please try again or open a support ticket.' });
  }
}
