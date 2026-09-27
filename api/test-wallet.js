import { getPool } from './_lib/db.js';
import { readCookie, verifySessionToken } from './_lib/session.js';
import { ensureCryptoTestnetSchema } from './_lib/cryptoTestnetSchema.js';
import { fetchNileAccount, isTronAddress } from './_lib/tronTestnet.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  const send = (code, body) => { res.statusCode = code; res.end(JSON.stringify(body)); };
  if (req.method !== 'GET') return send(405, { error: 'Method not allowed' });
  try {
    const token = readCookie(req, 'gf_session');
    if (!token) return send(401, { error: 'Sign in required.' });
    const { uid } = await verifySessionToken(token);
    if (process.env.TRON_TESTNET_ENABLED !== 'true') return send(503, { error: 'Nile testnet is not enabled.' });
    await ensureCryptoTestnetSchema();
    const pool = getPool();
    const { rows } = await pool.query(`SELECT u.status, COALESCE(t.balance_inr,0) AS balance_inr FROM users u LEFT JOIN test_wallets t ON t.user_id=u.id WHERE u.id=$1`, [uid]);
    if (rows[0]?.status !== 'active') return send(403, { error: 'Account is not active.' });
    const address = String(req.query?.address || '');
    if (address && !isTronAddress(address)) return send(400, { error: 'Invalid TRON public address.' });
    const { rows: orders } = await pool.query(`SELECT id, recipient_address, amount_inr, amount_usdt, status, txid, created_at FROM test_buy_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10`, [uid]);
    const { rows: sells } = await pool.query(`SELECT id, expected_amount_usdt, requested_amount_inr, status, txid, deposit_address, expires_at, created_at FROM crypto_deposit_intents WHERE user_id=$1 AND network='NILE' ORDER BY created_at DESC LIMIT 10`, [uid]);
    const onChain = address ? await fetchNileAccount(address) : null;
    return send(200, { network: 'NILE', testnet: true, address: address || null, onChain, testBalanceInr: Number(rows[0].balance_inr), buyOrders: orders.map(row => ({ id: row.id, address: row.recipient_address, inr: Number(row.amount_inr), usdt: Number(row.amount_usdt), status: row.status, txid: row.txid, createdAt: row.created_at })), sellOrders: sells.map(row => ({ id: row.id, usdt: Number(row.expected_amount_usdt), inr: Number(row.requested_amount_inr), status: row.status, txid: row.txid, depositAddress: row.deposit_address, expiresAt: row.expires_at, createdAt: row.created_at })) });
  } catch (error) {
    console.error('test-wallet:', error);
    return send(502, { error: 'Could not load Nile wallet. Please retry.' });
  }
}
