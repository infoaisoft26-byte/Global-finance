export const BEP20_WALLET = '0x062D87BE020291b34D08fdCfa7E432248680910E';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export function rechargeConfigured() {
  const paymentsEnabled = String(process.env.PAYMENTS_ENABLED || '').trim().toLowerCase() === 'true';
  const rechargeEnabled = String(process.env.USDT_RECHARGE_ENABLED || '').trim().toLowerCase() === 'true';
  const contract = String(process.env.USDT_BEP20_CONTRACT_ADDRESS || '').trim();
  const rpc = String(process.env.BSC_RPC_URL || '').trim();
  const contractValid = /^0x[0-9a-fA-F]{40}$/.test(contract);
  const rpcConfigured = /^https?:\/\//i.test(rpc);

  console.log('GLOBAL FINANCE PAYMENT CONFIG:', {
    paymentsEnabled,
    rechargeEnabled,
    contractValid,
    rpcConfigured,
  });

  return paymentsEnabled && rechargeEnabled && contractValid && rpcConfigured;
}

export function autoCreditConfigured() {
  return rechargeConfigured() && process.env.PAYMENT_AUTO_CREDIT_ENABLED === 'true';
}

export function getAutoCreditRate() {
  if (!autoCreditConfigured()) throw new Error('AUTO_CREDIT_DISABLED');
  return '1';
}

export async function verifyBep20(txHash, claimedAmount) {
  if (!rechargeConfigured()) throw new Error('RECHARGE_DISABLED');

  const token = process.env.USDT_BEP20_CONTRACT_ADDRESS.toLowerCase();
  const rpc = process.env.BSC_RPC_URL;

  const rpcCall = async (method, params) => {
    try {
      const response = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) throw new Error('BSC_RPC_FAILED');

      const body = await response.json();
      if (body.error || body.result === undefined) throw new Error('BSC_RPC_FAILED');
      return body.result;
    } catch (error) {
      console.error('BSC RPC request failed:', error instanceof Error ? error.message : error);
      throw new Error('BSC_RPC_FAILED');
    }
  };

  if (await rpcCall('eth_chainId', []) !== '0x38') throw new Error('WRONG_NETWORK');

  const receipt = await rpcCall('eth_getTransactionReceipt', [txHash]);
  if (
    !receipt ||
    receipt.status !== '0x1' ||
    receipt.transactionHash?.toLowerCase() !== txHash.toLowerCase() ||
    !receipt.blockNumber
  ) {
    throw new Error('TRANSACTION_NOT_CONFIRMED');
  }

  const headHex = await rpcCall('eth_blockNumber', []);
  const blockHex = receipt.blockNumber;
  if (
    typeof headHex !== 'string' ||
    !/^0x[0-9a-fA-F]+$/.test(headHex) ||
    typeof blockHex !== 'string' ||
    !/^0x[0-9a-fA-F]+$/.test(blockHex)
  ) {
    throw new Error('TRANSACTION_NOT_CONFIRMED');
  }

  const head = BigInt(headHex);
  const block = BigInt(blockHex);
  if (head < block || head - block + 1n < 12n) throw new Error('TRANSACTION_NOT_CONFIRMED');

  const decimalsHex = await rpcCall('eth_call', [{ to: token, data: '0x313ce567' }, 'latest']);
  if (
    typeof decimalsHex !== 'string' ||
    !/^0x[0-9a-fA-F]+$/.test(decimalsHex) ||
    decimalsHex === '0x'
  ) {
    throw new Error('INVALID_TOKEN');
  }

  const decimals = Number(BigInt(decimalsHex));
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error('INVALID_TOKEN');
  }

  const amountText = String(claimedAmount).trim();
  if (!/^\d+(?:\.\d+)?$/.test(amountText)) {
    throw new Error('TRANSFER_MISMATCH');
  }

  const [whole, fraction = ''] = amountText.split('.');
  if (fraction.length > decimals) throw new Error('TRANSFER_MISMATCH');

  const expected =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, '0') || '0');

  const target = '0x' + BEP20_WALLET.slice(2).toLowerCase().padStart(64, '0');

  const logs = (receipt.logs || []).filter(log =>
    log.address?.toLowerCase() === token &&
    log.topics?.length === 3 &&
    log.topics[0]?.toLowerCase() === TRANSFER_TOPIC &&
    log.topics[2]?.toLowerCase() === target
  );

  if (!logs.length) throw new Error('TRANSFER_MISMATCH');

  let received = 0n;
  for (const log of logs) {
    if (typeof log.data !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(log.data)) {
      throw new Error('TRANSFER_MISMATCH');
    }
    received += BigInt(log.data);
  }

  if (received !== expected) throw new Error('TRANSFER_MISMATCH');

  return {
    token,
    block: block.toString(),
    confirmations: (head - block + 1n).toString(),
    received: received.toString(),
    decimals,
  };
}
