const SHASTA_BASE_URL = 'https://api.shasta.trongrid.io';
const DEFAULT_SHASTA_USDT_CONTRACT = 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs';

export function getTronTestnetConfig() {
  const enabled = String(process.env.TRON_TESTNET_ENABLED || '').toLowerCase() === 'true';
  const depositAddress = String(process.env.TRON_TESTNET_DEPOSIT_ADDRESS || '').trim();
  const contractAddress = String(process.env.TRON_TESTNET_TRC20_CONTRACT || DEFAULT_SHASTA_USDT_CONTRACT).trim();
  const apiKey = String(process.env.TRONGRID_API_KEY || '').trim();
  const decimals = Number(process.env.TRON_TESTNET_TOKEN_DECIMALS || 6);
  const rateInrPerUsdt = Number(process.env.TRON_TESTNET_INR_PER_USDT || 100);

  if (!enabled) throw new Error('TRON testnet deposits are disabled');
  if (!/^T[1-9A-HJ-NP-Za-km-z]{20,40}$/.test(depositAddress)) throw new Error('TRON_TESTNET_DEPOSIT_ADDRESS is not configured');
  if (!/^T[1-9A-HJ-NP-Za-km-z]{20,40}$/.test(contractAddress)) throw new Error('TRON_TESTNET_TRC20_CONTRACT is invalid');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error('TRON_TESTNET_TOKEN_DECIMALS is invalid');
  if (!Number.isFinite(rateInrPerUsdt) || rateInrPerUsdt <= 0) throw new Error('TRON_TESTNET_INR_PER_USDT is invalid');

  return { enabled, baseUrl: SHASTA_BASE_URL, depositAddress, contractAddress, apiKey, decimals, rateInrPerUsdt };
}

export async function fetchConfirmedTrc20Transfers({ address, minTimestamp = 0 }) {
  const config = getTronTestnetConfig();
  const params = new URLSearchParams({ only_confirmed: 'true', limit: '200', order_by: 'block_timestamp,desc' });
  if (minTimestamp > 0) params.set('min_timestamp', String(Math.floor(minTimestamp)));
  const response = await fetch(`${config.baseUrl}/v1/accounts/${encodeURIComponent(address)}/transactions/trc20?${params.toString()}`, {
    headers: { accept: 'application/json', ...(config.apiKey ? { 'TRON-PRO-API-KEY': config.apiKey } : {}) },
  });
  if (!response.ok) throw new Error(`TronGrid Shasta request failed (${response.status})`);
  const payload = await response.json();
  if (!payload?.success || !Array.isArray(payload.data)) throw new Error('Unexpected TronGrid Shasta response');
  return payload.data;
}

export function isMatchingConfirmedTransfer(tx, intent, config) {
  if (!tx || tx.type !== 'Transfer') return false;
  const tokenAddress = String(tx.token_info?.address || tx.token_info?.contract_address || '');
  const value = String(tx.value || '');
  const to = String(tx.to || '');
  const timestamp = Number(tx.block_timestamp || 0);
  return to === config.depositAddress && tokenAddress === config.contractAddress && value === String(intent.expected_amount_atomic) && timestamp >= new Date(intent.created_at).getTime() - 60000 && timestamp <= new Date(intent.expires_at).getTime() + 300000;
}
