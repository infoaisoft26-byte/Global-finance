const NILE_BASE_URL = 'https://nile.trongrid.io';
const NILE_USDT_CONTRACT = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';
export const isTronAddress = address => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(address || ''));

export async function fetchNileAccount(address) {
  if (!isTronAddress(address)) throw new Error('Invalid TRON public address');
  const response = await fetch(`${NILE_BASE_URL}/v1/accounts/${encodeURIComponent(address)}`, {
    headers: { accept: 'application/json', ...(process.env.TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY } : {}) },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Nile account lookup failed (${response.status})`);
  const payload = await response.json();
  if (!payload.success || !Array.isArray(payload.data)) throw new Error('Unexpected Nile account response');
  const account = payload.data[0] || {};
  const tokens = account.trc20 || [];
  const rawUsdt = tokens.find(item => Object.hasOwn(item, NILE_USDT_CONTRACT))?.[NILE_USDT_CONTRACT] || '0';
  // Keep numeric conversions at the display boundary; no balance is written to the database here.
  return { trx: Number(account.balance || 0) / 1e6, usdt: Number(rawUsdt) / 1e6 };
}

export function getTronTestnetConfig() {
  const enabled = String(process.env.TRON_TESTNET_ENABLED || '').toLowerCase() === 'true';
  const depositAddress = String(process.env.TRON_TESTNET_DEPOSIT_ADDRESS || '').trim();
  const apiKey = String(process.env.TRONGRID_API_KEY || '').trim();
  const decimals = Number(process.env.TRON_TESTNET_TOKEN_DECIMALS || 6);
  const rateInrPerUsdt = Number(process.env.TRON_TESTNET_INR_PER_USDT || 100);

  if (!enabled) throw new Error('TRON testnet deposits are disabled');
  if (!isTronAddress(depositAddress)) throw new Error('TRON_TESTNET_DEPOSIT_ADDRESS is not configured');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error('TRON_TESTNET_TOKEN_DECIMALS is invalid');
  if (!Number.isFinite(rateInrPerUsdt) || rateInrPerUsdt <= 0) throw new Error('TRON_TESTNET_INR_PER_USDT is invalid');

  return {
    enabled,
    network: 'NILE',
    baseUrl: NILE_BASE_URL,
    depositAddress,
    contractAddress: NILE_USDT_CONTRACT,
    apiKey,
    decimals,
    rateInrPerUsdt,
  };
}

export async function fetchConfirmedTrc20Transfers({ address, minTimestamp = 0 }) {
  const config = getTronTestnetConfig();
  const params = new URLSearchParams({ only_confirmed: 'true', limit: '200', order_by: 'block_timestamp,desc' });
  if (minTimestamp > 0) params.set('min_timestamp', String(Math.floor(minTimestamp)));
  const response = await fetch(`${config.baseUrl}/v1/accounts/${encodeURIComponent(address)}/transactions/trc20?${params.toString()}`, {
    headers: { accept: 'application/json', ...(config.apiKey ? { 'TRON-PRO-API-KEY': config.apiKey } : {}) },
  });
  if (!response.ok) throw new Error(`TronGrid Nile request failed (${response.status})`);
  const payload = await response.json();
  if (!payload?.success || !Array.isArray(payload.data)) throw new Error('Unexpected TronGrid Nile response');
  return payload.data;
}

export function isMatchingConfirmedTransfer(tx, intent, config) {
  if (!tx || tx.type !== 'Transfer') return false;
  const tokenAddress = String(tx.token_info?.address || tx.token_info?.contract_address || '');
  const value = String(tx.value || '');
  const to = String(tx.to || '');
  const timestamp = Number(tx.block_timestamp || 0);
  return to === config.depositAddress && tx.from !== config.depositAddress && tokenAddress === config.contractAddress && value === String(intent.expected_amount_atomic) && timestamp >= new Date(intent.created_at).getTime() - 60000 && timestamp <= new Date(intent.expires_at).getTime() + 300000;
}

export function isMatchingBuyTransfer(tx, order, config, txid) {
  if (!tx || tx.transaction_id !== txid || tx.type !== 'Transfer') return false;
  const token = String(tx.token_info?.address || tx.token_info?.contract_address || '');
  const atomic = BigInt(Math.round(Number(order.amount_usdt) * 10 ** config.decimals));
  return tx.from === config.depositAddress && tx.to === order.recipient_address && tx.from !== tx.to &&
    token === config.contractAddress && /^\d+$/.test(String(tx.value || '')) && BigInt(tx.value) === atomic &&
    Number(tx.block_timestamp || 0) >= new Date(order.created_at).getTime() - 60000;
}
