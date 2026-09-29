export const BEP20_WALLET = '0x062D87BE020291b34D08fdCfa7E432248680910E';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export function rechargeConfigured() {
  return process.env.PAYMENTS_ENABLED === 'true' && process.env.USDT_RECHARGE_ENABLED === 'true' &&
    /^0x[0-9a-fA-F]{40}$/.test(process.env.USDT_BEP20_CONTRACT_ADDRESS || '') && !!process.env.BSC_RPC_URL;
}

export function autoCreditConfigured() {
  const rate = String(process.env.USDT_TO_INR_RATE || '').trim();
  return rechargeConfigured() && process.env.PAYMENT_AUTO_CREDIT_ENABLED === 'true' &&
    /^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,6})?$/.test(rate) && Number(rate) > 0;
}

export function getAutoCreditRate() {
  if (!autoCreditConfigured()) throw new Error('AUTO_CREDIT_DISABLED');
  return String(process.env.USDT_TO_INR_RATE).trim();
}

export async function verifyBep20(txHash, claimedAmount) {
  if (!rechargeConfigured()) throw new Error('RECHARGE_DISABLED');
  const token = process.env.USDT_BEP20_CONTRACT_ADDRESS.toLowerCase();
  const rpc = async (method, params) => {
    const response = await fetch(process.env.BSC_RPC_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('BSC_RPC_FAILED');
    const body = await response.json();
    if (body.error || body.result === undefined) throw new Error('BSC_RPC_FAILED');
    return body.result;
  };
  if (await rpc('eth_chainId', []) !== '0x38') throw new Error('WRONG_NETWORK');
  const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
  if (!receipt || receipt.status !== '0x1' || receipt.transactionHash?.toLowerCase() !== txHash || !receipt.blockNumber) throw new Error('TRANSACTION_NOT_CONFIRMED');
  const head = BigInt(await rpc('eth_blockNumber', []));
  const block = BigInt(receipt.blockNumber);
  if (head < block || head - block + 1n < 12n) throw new Error('TRANSACTION_NOT_CONFIRMED');
  const decimals = Number(BigInt(await rpc('eth_call', [{ to: token, data: '0x313ce567' }, 'latest'])));
  if (!Number.isInteger(decimals) || decimals < 8 || decimals > 24) throw new Error('INVALID_TOKEN');
  const target = `0x${BEP20_WALLET.slice(2).toLowerCase().padStart(64, '0')}`;
  const logs = (receipt.logs || []).filter(log => log.address?.toLowerCase() === token &&
    log.topics?.length === 3 && log.topics[0]?.toLowerCase() === TRANSFER_TOPIC && log.topics[2]?.toLowerCase() === target);
  const received = logs.reduce((sum, log) => sum + BigInt(log.data), 0n);
  const [whole, fraction = ''] = claimedAmount.split('.');
  const expected = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0'));
  if (!logs.length || received !== expected) throw new Error('TRANSFER_MISMATCH');
  return { token, block: block.toString(), confirmations: (head - block + 1n).toString(), received: received.toString(), decimals };
}
