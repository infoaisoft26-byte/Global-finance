import crypto from 'node:crypto';
import { getPool, withTransaction } from './_lib/db.js';
import { readCookie, verifySessionToken } from './_lib/session.js';
import { ensureCryptoTestnetSchema } from './_lib/cryptoTestnetSchema.js';
import { getTronTestnetConfig, isTronAddress } from './_lib/tronTestnet.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, body) => { res.statusCode = code; res.end(JSON.stringify(body)); };
  if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });
  try {
    const token = readCookie(req, 'gf_session');
    if (!token) return send(401, { error: 'Sign in required.' });
    const { uid } = await verifySessionToken(token);
    const config = getTronTestnetConfig();
    const inr = Number(req.body?.amountInr);
    const address = String(req.body?.address || '');
    if (!Number.isFinite(inr) || inr < 100 || inr > 500000 || !/^\d+(?:\.\d{1,2})?$/.test(String(req.body?.amountInr)) || !isTronAddress(address) || address===config.depositAddress) return send(400, { error: 'Enter ₹100–₹5,00,000 in test credits and a Nile address different from the treasury.' });
    const usdt = Number((inr / config.rateInrPerUsdt).toFixed(6));
    await ensureCryptoTestnetSchema();
    const result = await withTransaction(async client => {
      const { rows: users } = await client.query(`SELECT status FROM users WHERE id=$1`, [uid]);
      if (users[0]?.status !== 'active') return { error: 'Account is not active.', status: 403 };
      const { rows: active } = await client.query(`SELECT id FROM test_buy_orders WHERE user_id=$1 AND status='pending' LIMIT 1`, [uid]);
      if (active.length) return { error: 'Complete the current buy request first.', status: 409 };
      const { rows } = await client.query(`UPDATE test_wallets SET balance_inr=balance_inr-$1, updated_at=NOW() WHERE user_id=$2 AND balance_inr >= $1 RETURNING balance_inr`, [inr, uid]);
      if (!rows.length) return { error: 'Insufficient test credits. Sell test USDT first.', status: 409 };
      const id = `TBUY_${crypto.randomUUID().replaceAll('-', '').slice(0,24)}`;
      await client.query(`INSERT INTO test_buy_orders (id,user_id,recipient_address,amount_inr,amount_usdt) VALUES ($1,$2,$3,$4,$5)`, [id,uid,address,inr,usdt]);
      await client.query(`INSERT INTO test_wallet_entries (id,user_id,amount_inr,kind,reference_id) VALUES ($1,$2,$3,'buy_reserved',$4)`, [`TST_${crypto.randomUUID().replaceAll('-', '').slice(0,26)}`,uid,-inr,id]);
      return { id, amountUsdt: usdt, testBalanceInr: Number(rows[0].balance_inr), status: 'pending' };
    });
    if (result.error) return send(result.status, { error: result.error });
    return send(201, { testnet: true, network: 'NILE', order: result, message: 'Test USDT buy request pending treasury transfer. Tokens are not yet in your wallet.' });
  } catch (error) {
    console.error('test-buy-order:', error);
    return send(500, { error: 'Could not create Nile buy request.' });
  }
}
