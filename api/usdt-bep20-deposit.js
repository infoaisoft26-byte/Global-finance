import crypto from 'node:crypto';
import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';
import { withTransaction } from './_lib/db.js';

const DEFAULT_RECEIVER = '0x062D87BE020291b34D08fdCfa7E432248680910E';
const USDT_BEP20_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const MIN_CONFIRMATIONS = Math.max(3, Number(process.env.BEP20_MIN_CONFIRMATIONS || 12));
const RPC_URL = String(process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/').trim();

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function normalizeAddress(value) {
  const v = String(value || '').trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(v) ? v : '';
}

function normalizeHash(value) {
  const v = String(value || '').trim().toLowerCase();
  return /^0x[a-f0-9]{64}$/.test(v) ? v : '';
}

function topicAddress(topic) {
  const v = String(topic || '').toLowerCase().replace(/^0x/, '');
  return v.length === 64 ? `0x${v.slice(24)}` : '';
}

function formatUnits(raw, decimals = 18) {
  const value = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

async function rpc(method, params = []) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`BSC RPC HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.error) throw new Error(payload.error.message || 'BSC RPC error');
    return payload?.result;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const auth = String(req.headers.authorization || '');
    const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const decoded = await verifyFirebaseIdToken(idToken);
    const uid = String(decoded.uid || '');
    const email = String(decoded.email || '').trim().toLowerCase();
    if (!uid || !email) return json(res, 401, { error: 'Authenticated member required' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const txHash = normalizeHash(body.txHash);
    const paymentProofUrl = String(body.paymentProofUrl || '').trim();
    if (!txHash) return json(res, 400, { error: 'Valid BEP20 transaction hash is required' });

    const receiver = normalizeAddress(process.env.USDT_BEP20_RECEIVER || DEFAULT_RECEIVER);
    if (!receiver) return json(res, 503, { error: 'Deposit receiver is not configured' });

    const [chainId, receipt, currentBlockHex] = await Promise.all([
      rpc('eth_chainId'),
      rpc('eth_getTransactionReceipt', [txHash]),
      rpc('eth_blockNumber'),
    ]);

    if (String(chainId).toLowerCase() !== '0x38') return json(res, 503, { error: 'Configured RPC is not BNB Smart Chain mainnet' });
    if (!receipt) return json(res, 202, { verified: false, status: 'pending_chain', error: 'Transaction is not mined yet' });
    if (String(receipt.status).toLowerCase() !== '0x1') return json(res, 400, { verified: false, status: 'failed', error: 'Blockchain transaction failed' });

    const txBlock = Number.parseInt(String(receipt.blockNumber || '0x0'), 16);
    const currentBlock = Number.parseInt(String(currentBlockHex || '0x0'), 16);
    const confirmations = Math.max(0, currentBlock - txBlock + 1);
    if (confirmations < MIN_CONFIRMATIONS) {
      return json(res, 202, { verified: false, status: 'confirming', confirmations, requiredConfirmations: MIN_CONFIRMATIONS, error: `Waiting for ${MIN_CONFIRMATIONS - confirmations} more confirmation(s)` });
    }

    let totalRaw = 0n;
    for (const log of Array.isArray(receipt.logs) ? receipt.logs : []) {
      if (normalizeAddress(log.address) !== normalizeAddress(USDT_BEP20_CONTRACT)) continue;
      const topics = Array.isArray(log.topics) ? log.topics : [];
      if (String(topics[0] || '').toLowerCase() !== TRANSFER_TOPIC) continue;
      if (topicAddress(topics[2]) !== receiver) continue;
      try { totalRaw += BigInt(String(log.data || '0x0')); } catch { /* ignore malformed log */ }
    }

    if (totalRaw <= 0n) return json(res, 400, { verified: false, status: 'wrong_payment', error: 'No USDT BEP20 transfer to the configured Global Finance wallet was found in this transaction' });

    const amountText = formatUnits(totalRaw, 18);
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount <= 0) return json(res, 400, { error: 'Unable to parse verified USDT amount' });

    const creditId = `BEP20-${txHash}`;
    const result = await withTransaction(async (client) => {
      const memberResult = await client.query('SELECT id,email,status FROM users WHERE id=$1 AND email=$2 LIMIT 1 FOR UPDATE', [uid, email]);
      const member = memberResult.rows[0];
      if (!member || member.status !== 'active') throw new Error('Active member account required');

      const existing = await client.query('SELECT id,user_id,amount FROM ledger_transactions WHERE id=$1 LIMIT 1', [creditId]);
      if (existing.rowCount) {
        if (existing.rows[0].user_id !== uid) throw new Error('Transaction hash has already been claimed by another account');
        if (paymentProofUrl) {
          await client.query(`UPDATE ledger_transactions SET metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb WHERE id=$1`, [creditId, JSON.stringify({ paymentProofUrl, proofUploaded: true })]);
        }
        const walletResult = await client.query('SELECT * FROM wallets WHERE user_id=$1 LIMIT 1', [uid]);
        return { alreadyCredited: true, wallet: walletResult.rows[0], amount: Number(existing.rows[0].amount || amount) };
      }

      await client.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [uid]);
      await client.query(`UPDATE wallets SET fund_wallet = fund_wallet + $2, updated_at = NOW() WHERE user_id=$1`, [uid, amount]);

      await client.query(
        `INSERT INTO ledger_transactions (id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata)
         VALUES ($1,$2,'crypto_deposit','fund_wallet','credit',$3,0,$3,$4,$5,'completed',$6::jsonb)`,
        [creditId, uid, amount, `Verified USDT BEP20 deposit ${txHash}`, txHash, JSON.stringify({ asset: 'USDT', network: 'BEP20', chainId: 56, tokenContract: USDT_BEP20_CONTRACT, receiver, txHash, confirmations, rawAmount: totalRaw.toString(), decimals: 18, verifiedOnChain: true, paymentProofUrl: paymentProofUrl || null, proofUploaded: Boolean(paymentProofUrl) })]
      );

      await client.query(
        `INSERT INTO audit_logs (id,actor_user_id,actor_email,action,entity_type,entity_id,metadata)
         VALUES ($1,$2,$3,'USDT_BEP20_DEPOSIT_AUTO_CREDITED','ledger',$4,$5::jsonb)`,
        [crypto.randomUUID(), uid, email, creditId, JSON.stringify({ txHash, amount, receiver, confirmations, tokenContract: USDT_BEP20_CONTRACT, paymentProofUrl: paymentProofUrl || null })]
      );

      const walletResult = await client.query('SELECT * FROM wallets WHERE user_id=$1 LIMIT 1', [uid]);
      return { alreadyCredited: false, wallet: walletResult.rows[0], amount };
    });

    return json(res, 200, { verified: true, credited: true, alreadyCredited: result.alreadyCredited, asset: 'USDT', network: 'BEP20', amount: result.amount, txHash, confirmations, requiredConfirmations: MIN_CONFIRMATIONS, fundWallet: Number(result.wallet?.fund_wallet || 0), proofUploaded: Boolean(paymentProofUrl) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Deposit verification failed';
    console.error('usdt-bep20-deposit failed:', message);
    const status = /claimed by another account/i.test(message) ? 409 : /active member/i.test(message) ? 403 : 500;
    return json(res, status, { verified: false, error: status === 500 ? 'Unable to verify and credit this deposit right now' : message });
  }
}
