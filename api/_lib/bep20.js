```javascript
export const BEP20_WALLET = '0x062D87BE020291b34D08fdCfa7E432248680910E';

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const BSC_CHAIN_ID = '0x38';
const MIN_CONFIRMATIONS = 12;
const RPC_TIMEOUT_MS = 15000;

const CONTRACT_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const AMOUNT_PATTERN = /^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/;

function getContractAddress() {
  const value = String(
    process.env.USDT_BEP20_CONTRACT_ADDRESS || ''
  ).trim();

  if (!CONTRACT_ADDRESS_PATTERN.test(value)) {
    throw new Error('INVALID_TOKEN');
  }

  return value.toLowerCase();
}

function getRpcUrl() {
  const value = String(process.env.BSC_RPC_URL || '').trim();

  if (!value) {
    throw new Error('BSC_RPC_FAILED');
  }

  try {
    const url = new URL(value);

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('BSC_RPC_FAILED');
    }
  } catch {
    throw new Error('BSC_RPC_FAILED');
  }

  return value;
}

export function rechargeConfigured() {
  return (
    process.env.PAYMENTS_ENABLED === 'true' &&
    process.env.USDT_RECHARGE_ENABLED === 'true' &&
    CONTRACT_ADDRESS_PATTERN.test(
      process.env.USDT_BEP20_CONTRACT_ADDRESS || ''
    ) &&
    Boolean(String(process.env.BSC_RPC_URL || '').trim())
  );
}

export function autoCreditConfigured() {
  return (
    rechargeConfigured() &&
    process.env.PAYMENT_AUTO_CREDIT_ENABLED === 'true'
  );
}

// 1 verified USDT = 1 Fund Wallet unit.
export function getAutoCreditRate() {
  if (!autoCreditConfigured()) {
    throw new Error('AUTO_CREDIT_DISABLED');
  }

  return '1';
}

async function rpcRequest(method, params) {
  const rpcUrl = getRpcUrl();

  let response;

  try {
    response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
  } catch (error) {
    console.error('BSC RPC request failed:', {
      method,
      error: error instanceof Error ? error.message : error,
    });

    throw new Error('BSC_RPC_FAILED');
  }

  if (!response.ok) {
    console.error('BSC RPC HTTP error:', {
      method,
      status: response.status,
    });

    throw new Error('BSC_RPC_FAILED');
  }

  let body;

  try {
    body = await response.json();
  } catch {
    throw new Error('BSC_RPC_FAILED');
  }

  if (
    !body ||
    body.error ||
    body.result === undefined ||
    body.result === null
  ) {
    console.error('BSC RPC returned an error:', {
      method,
      error: body?.error?.message || body?.error?.code || 'Unknown RPC error',
    });

    throw new Error('BSC_RPC_FAILED');
  }

  return body.result;
}

function parseRpcQuantity(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error('BSC_RPC_FAILED');
  }

  return BigInt(value);
}

function parseTokenDecimals(value) {
  let decimals;

  try {
    decimals = Number(parseRpcQuantity(value));
  } catch {
    throw new Error('INVALID_TOKEN');
  }

  if (
    !Number.isSafeInteger(decimals) ||
    decimals < 0 ||
    decimals > 36
  ) {
    throw new Error('INVALID_TOKEN');
  }

  return decimals;
}

function amountToUnits(amount, decimals) {
  const normalized = String(amount || '').trim();

  if (!AMOUNT_PATTERN.test(normalized)) {
    throw new Error('INVALID_AMOUNT');
  }

  const [wholePart, fractionPart = ''] = normalized.split('.');

  if (fractionPart.length > decimals) {
    throw new Error('TRANSFER_MISMATCH');
  }

  const whole = BigInt(wholePart || '0');

  const fraction =
    fractionPart.length > 0
      ? BigInt(fractionPart.padEnd(decimals, '0'))
      : 0n;

  return whole * 10n ** BigInt(decimals) + fraction;
}

function getTransferRecipientTopic() {
  return `0x${BEP20_WALLET.slice(2).toLowerCase().padStart(64, '0')}`;
}

function normalizeAddress(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidTransferLog(log, token, recipientTopic) {
  return (
    log &&
    normalizeAddress(log.address) === token &&
    Array.isArray(log.topics) &&
    log.topics.length >= 3 &&
    normalizeAddress(log.topics[0]) === TRANSFER_TOPIC &&
    normalizeAddress(log.topics[2]) === recipientTopic
  );
}

function parseTransferAmount(log) {
  if (typeof log?.data !== 'string' || !/^0x[0-9a-fA-F]+$/.test(log.data)) {
    throw new Error('TRANSFER_MISMATCH');
  }

  return BigInt(log.data);
}

export async function verifyBep20(txHash, claimedAmount) {
  if (!rechargeConfigured()) {
    throw new Error('RECHARGE_DISABLED');
  }

  const normalizedTxHash = String(txHash || '').trim().toLowerCase();

  if (!TX_HASH_PATTERN.test(normalizedTxHash)) {
    throw new Error('INVALID_TX_HASH');
  }

  const normalizedAmount = String(claimedAmount || '').trim();

  if (!AMOUNT_PATTERN.test(normalizedAmount)) {
    throw new Error('INVALID_AMOUNT');
  }

  const token = getContractAddress();

  // Confirm that the RPC endpoint is actually BSC.
  const chainId = String(
    await rpcRequest('eth_chainId', [])
  ).toLowerCase();

  if (chainId !== BSC_CHAIN_ID) {
    throw new Error('WRONG_NETWORK');
  }

  // Get transaction receipt.
  const receipt = await rpcRequest(
    'eth_getTransactionReceipt',
    [normalizedTxHash]
  );

  if (!receipt) {
    throw new Error('TRANSACTION_NOT_CONFIRMED');
  }

  const receiptHash = String(
    receipt.transactionHash || ''
  ).toLowerCase();

  if (
    receiptHash !== normalizedTxHash ||
    receipt.status !== '0x1' ||
    !receipt.blockNumber
  ) {
    throw new Error('TRANSACTION_NOT_CONFIRMED');
  }

  // Current block.
  const head = parseRpcQuantity(
    await rpcRequest('eth_blockNumber', [])
  );

  const block = parseRpcQuantity(receipt.blockNumber);

  if (head < block) {
    throw new Error('TRANSACTION_NOT_CONFIRMED');
  }

  const confirmations = head - block + 1n;

  if (confirmations < BigInt(MIN_CONFIRMATIONS)) {
    throw new Error('TRANSACTION_NOT_CONFIRMED');
  }

  // Read token decimals from the actual configured contract.
  const decimalsRaw = await rpcRequest(
    'eth_call',
    [
      {
        to: token,
        data: '0x313ce567',
      },
      'latest',
    ]
  );

  const decimals = parseTokenDecimals(decimalsRaw);

  // USDT-style tokens should normally use 6 decimals on BSC,
  // but we accept a reasonable range so the contract itself is authoritative.
  if (decimals < 6 || decimals > 24) {
    throw new Error('INVALID_TOKEN');
  }

  const recipientTopic = getTransferRecipientTopic();

  const logs = Array.isArray(receipt.logs)
    ? receipt.logs.filter((log) =>
        isValidTransferLog(
          log,
          token,
          recipientTopic
        )
      )
    : [];

  if (!logs.length) {
    throw new Error('TRANSFER_MISMATCH');
  }

  let received = 0n;

  for (const log of logs) {
    received += parseTransferAmount(log);
  }

  const expected = amountToUnits(
    normalizedAmount,
    decimals
  );

  if (received !== expected) {
    console.error('BEP20 transfer amount mismatch:', {
      txHash: normalizedTxHash,
      claimedAmount: normalizedAmount,
      decimals,
      expected: expected.toString(),
      received: received.toString(),
      recipient: BEP20_WALLET,
      token,
    });

    throw new Error('TRANSFER_MISMATCH');
  }

  return {
    token,
    recipient: BEP20_WALLET,
    transactionHash: normalizedTxHash,
    block: block.toString(),
    confirmations: confirmations.toString(),
    received: received.toString(),
    claimedAmount: normalizedAmount,
    decimals,
    verified: true,
  };
}
```
