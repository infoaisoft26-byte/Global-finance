import { randomUUID } from 'node:crypto';
import { getPool, withTransaction } from './_lib/db.js';
import { verifyFirebaseIdToken } from './_lib/firebaseAdmin.js';

const SETTINGS_ID = 'global_finance_system_settings';
const codePattern = /^GF\d{6}$/;
const amountPattern = /^(?:0|[1-9][0-9]{0,12})(?:\.[0-9]{1,2})?$/;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(body));
}

async function actorFromRequest(req) {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) throw new Error('AUTH_REQUIRED');
  const decoded = await verifyFirebaseIdToken(auth.slice(7));
  const email = String(decoded.email || '').trim().toLowerCase();
  const result = await getPool().query(
    `SELECT id,email,name,referral_code,role,status,kyc_status
     FROM users WHERE id=$1 AND email=$2 LIMIT 1`,
    [decoded.uid, email]
  );
  const actor = result.rows[0];
  if (!actor || actor.status !== 'active' || actor.role !== 'user') throw new Error('ACTIVE_MEMBER_REQUIRED');
  return actor;
}

async function p2pSettings(client = getPool()) {
  const result = await client.query('SELECT data FROM app_settings WHERE id=$1 LIMIT 1', [SETTINGS_ID]).catch(() => ({ rows: [] }));
  const data = result.rows?.[0]?.data || {};
  return {
    enabled: data.p2pEnabled !== false,
    requireKyc: data.requireKycForP2p === true,
    min: Number.isFinite(Number(data.minP2p)) ? Number(data.minP2p) : 1,
    max: Number.isFinite(Number(data.maxP2p)) ? Number(data.maxP2p) : 1000000,
  };
}

function historyRow(row) {
  const meta = row.metadata || {};
  return {
    id: row.id,
    reference: row.reference_id,
    requestType: 'p2p_transfer',
    sourceWalletType: 'fund_wallet',
    destinationWalletType: 'peer_user',
    userId: row.user_id,
    userReferralCode: meta.senderReferralCode || '',
    beneficiaryUserId: meta.counterpartyUserId || '',
    beneficiaryReferralCode: meta.counterpartyCode || '',
    beneficiaryName: meta.counterpartyName || 'Member',
    amountRupees: Number(row.amount || 0),
    amountPaise: Math.round(Number(row.amount || 0) * 100),
    feeRupees: 0,
    feePaise: 0,
    netAmountRupees: Number(row.amount || 0),
    netAmountPaise: Math.round(Number(row.amount || 0) * 100),
    status: 'completed',
    userNote: meta.note || '',
    createdAt: row.created_at,
    updatedAt: row.created_at,
    completedAt: row.created_at,
  };
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
  try {
    const actor = await actorFromRequest(req);
    const settings = await p2pSettings();

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const recipientCode = String(url.searchParams.get('recipient') || '').trim().toUpperCase();
      if (recipientCode) {
        if (!codePattern.test(recipientCode)) return json(res, 400, { error: 'Enter a valid GF Member ID, e.g. GF123456.' });
        if (recipientCode === String(actor.referral_code || '').toUpperCase()) return json(res, 400, { error: 'You cannot transfer funds to your own Member ID.' });
        const result = await getPool().query(
          `SELECT id,name,referral_code,status FROM users WHERE upper(referral_code)=$1 LIMIT 1`,
          [recipientCode]
        );
        const recipient = result.rows[0];
        if (!recipient) return json(res, 404, { error: `Recipient Member ID "${recipientCode}" was not found.` });
        if (recipient.status !== 'active') return json(res, 409, { error: `Member account "${recipientCode}" is not active and cannot receive transfers.` });
        return json(res, 200, { recipient: { name: recipient.name, referralCode: recipient.referral_code } });
      }

      const history = await getPool().query(
        `SELECT id,user_id,reference_id,amount,metadata,created_at
         FROM ledger_transactions
         WHERE user_id=$1 AND type='p2p_transfer' AND category='fund_wallet' AND flow='debit' AND status='completed'
         ORDER BY created_at DESC LIMIT 100`,
        [actor.id]
      );
      return json(res, 200, { history: history.rows.map(historyRow), settings });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const recipientCode = String(body.recipientCode || '').trim().toUpperCase();
    const amountText = String(body.amount || '').trim();
    const note = String(body.note || '').trim().slice(0, 250);

    if (!settings.enabled) return json(res, 403, { error: 'P2P transfers are currently disabled in platform settings.' });
    if (settings.requireKyc && actor.kyc_status !== 'verified') return json(res, 403, { error: 'KYC verification is required before sending P2P transfers.' });
    if (!codePattern.test(recipientCode)) return json(res, 400, { error: 'Enter a valid GF Member ID, e.g. GF123456.' });
    if (recipientCode === String(actor.referral_code || '').toUpperCase()) return json(res, 400, { error: 'Self-transfer is not permitted.' });
    if (!amountPattern.test(amountText) || Number(amountText) <= 0) return json(res, 400, { error: 'Enter a valid transfer amount.' });
    const amount = Number(Number(amountText).toFixed(2));
    if (amount < settings.min) return json(res, 400, { error: `Minimum P2P transfer amount is ${settings.min.toFixed(2)} USDT.` });
    if (amount > settings.max) return json(res, 400, { error: `Maximum P2P transfer amount is ${settings.max.toFixed(2)} USDT.` });

    const result = await withTransaction(async client => {
      const recipientResult = await client.query(
        `SELECT id,name,referral_code,status FROM users WHERE upper(referral_code)=$1 LIMIT 1`,
        [recipientCode]
      );
      const recipient = recipientResult.rows[0];
      if (!recipient) throw new Error('RECIPIENT_NOT_FOUND');
      if (recipient.status !== 'active') throw new Error('RECIPIENT_INACTIVE');
      if (recipient.id === actor.id) throw new Error('SELF_TRANSFER');

      await client.query('INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING', [actor.id]);
      await client.query('INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING', [recipient.id]);
      const locked = await client.query(
        `SELECT user_id,fund_wallet FROM wallets WHERE user_id IN ($1,$2) ORDER BY user_id FOR UPDATE`,
        [actor.id, recipient.id]
      );
      const senderWallet = locked.rows.find(r => r.user_id === actor.id);
      if (!senderWallet || Number(senderWallet.fund_wallet || 0) < amount) {
        const err = new Error('INSUFFICIENT_FUNDS');
        err.available = Number(senderWallet?.fund_wallet || 0);
        throw err;
      }

      const reference = `P2P_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
      const debitId = `P2PD_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
      const creditId = `P2PC_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
      const senderMeta = {
        counterpartyUserId: recipient.id,
        counterpartyCode: recipient.referral_code,
        counterpartyName: recipient.name,
        senderReferralCode: actor.referral_code,
        direction: 'sent',
        note,
        asset: 'USDT',
      };
      const recipientMeta = {
        counterpartyUserId: actor.id,
        counterpartyCode: actor.referral_code,
        counterpartyName: actor.name,
        senderReferralCode: actor.referral_code,
        direction: 'received',
        note,
        asset: 'USDT',
      };

      await client.query(
        `INSERT INTO ledger_transactions(id,user_id,type,category,flow,amount,fee,net_amount,description,reference_id,status,metadata)
         VALUES
         ($1,$2,'p2p_transfer','fund_wallet','debit',$3,0,$3,$4,$5,'completed',$6::jsonb),
         ($7,$8,'p2p_transfer','fund_wallet','credit',$3,0,$3,$9,$5,'completed',$10::jsonb)`,
        [debitId, actor.id, amount, `P2P transfer sent to ${recipient.referral_code}`, reference, JSON.stringify(senderMeta),
         creditId, recipient.id, `P2P transfer received from ${actor.referral_code}`, JSON.stringify(recipientMeta)]
      );
      await client.query('UPDATE wallets SET fund_wallet=fund_wallet-$1,updated_at=NOW() WHERE user_id=$2', [amount, actor.id]);
      await client.query('UPDATE wallets SET fund_wallet=fund_wallet+$1,updated_at=NOW() WHERE user_id=$2', [amount, recipient.id]);
      await client.query(
        `INSERT INTO audit_logs(id,actor_user_id,actor_email,action,entity_type,entity_id,metadata)
         VALUES($1,$2,$3,'P2P_TRANSFER_COMPLETED','ledger',$4,$5::jsonb)`,
        [randomUUID(), actor.id, actor.email, reference, JSON.stringify({ recipientUserId: recipient.id, recipientCode: recipient.referral_code, amount, asset: 'USDT', debitId, creditId })]
      );

      const balance = await client.query('SELECT fund_wallet FROM wallets WHERE user_id=$1', [actor.id]);
      return { reference, recipient, balance: Number(balance.rows[0]?.fund_wallet || 0) };
    });

    return json(res, 200, {
      success: true,
      reference: result.reference,
      recipient: { name: result.recipient.name, referralCode: result.recipient.referral_code },
      amount,
      asset: 'USDT',
      fundWallet: result.balance,
      message: `${amount.toFixed(2)} USDT transferred successfully to ${result.recipient.referral_code}. Reference: ${result.reference}`,
    });
  } catch (error) {
    const message = String(error?.message || '');
    if (message === 'AUTH_REQUIRED') return json(res, 401, { error: 'Authentication required' });
    if (message === 'ACTIVE_MEMBER_REQUIRED') return json(res, 403, { error: 'Active member account required' });
    if (message === 'RECIPIENT_NOT_FOUND') return json(res, 404, { error: 'Recipient Member ID was not found.' });
    if (message === 'RECIPIENT_INACTIVE') return json(res, 409, { error: 'Recipient account is not active and cannot receive transfers.' });
    if (message === 'SELF_TRANSFER') return json(res, 400, { error: 'Self-transfer is not permitted.' });
    if (message === 'INSUFFICIENT_FUNDS') return json(res, 409, { error: `Insufficient Available USDT. Available: ${Number(error.available || 0).toFixed(2)} USDT.` });
    console.error('p2p-transfer failed:', message);
    return json(res, 500, { error: 'P2P transfer could not be processed right now.' });
  }
}
