import test from 'node:test';
import assert from 'node:assert/strict';
import { rechargeConfigured, autoCreditConfigured, verifyBep20, BEP20_WALLET, DEFAULT_USDT_BEP20_CONTRACT } from '../api/_lib/bep20.js';

const TX = '0x' + 'a'.repeat(64);
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topicAddress = (address) => '0x' + address.slice(2).toLowerCase().padStart(64, '0');
const amount10 = '0x' + (10n * 10n ** 18n).toString(16).padStart(64, '0');

function setEnv(overrides = {}) {
  Object.assign(process.env, {
    PAYMENTS_ENABLED: 'true',
    USDT_RECHARGE_ENABLED: 'true',
    PAYMENT_AUTO_CREDIT_ENABLED: 'true',
    BSC_RPC_URL: 'https://bsc.example.invalid',
    USDT_BEP20_CONTRACT_ADDRESS: DEFAULT_USDT_BEP20_CONTRACT,
    ...overrides,
  });
}
function mockRpc({ chainId = '0x38', decimals = '0x12', head = '0x6f', receipt = null } = {}) {
  const goodReceipt = receipt || {
    transactionHash: TX,
    status: '0x1',
    blockNumber: '0x64',
    logs: [{
      address: DEFAULT_USDT_BEP20_CONTRACT,
      topics: [TRANSFER_TOPIC, topicAddress('0x1111111111111111111111111111111111111111'), topicAddress(BEP20_WALLET)],
      data: amount10,
    }],
  };
  globalThis.fetch = async (_url, options) => {
    const { method, params } = JSON.parse(options.body);
    let result;
    if (method === 'eth_chainId') result = chainId;
    else if (method === 'eth_getTransactionReceipt') result = goodReceipt;
    else if (method === 'eth_blockNumber') result = head;
    else if (method === 'eth_call') result = decimals;
    else throw new Error('Unexpected RPC method: ' + method);
    return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result }) };
  };
}

test('shared-address recharge config does not require BSC_DEPOSIT_XPUB', () => {
  delete process.env.BSC_DEPOSIT_XPUB;
  setEnv();
  assert.equal(rechargeConfigured(), true);
  assert.equal(autoCreditConfigured(), true);
});

test('recharge remains disabled unless payment flags are explicitly enabled', () => {
  setEnv({ PAYMENTS_ENABLED: 'false', USDT_RECHARGE_ENABLED: 'false', PAYMENT_AUTO_CREDIT_ENABLED: 'false' });
  assert.equal(rechargeConfigured(), false);
  assert.equal(autoCreditConfigured(), false);
});

test('verifies exact USDT BEP20 transfer to shared address after 12 confirmations', async () => {
  setEnv();
  mockRpc();
  const proof = await verifyBep20(TX, '10');
  assert.equal(proof.token, DEFAULT_USDT_BEP20_CONTRACT.toLowerCase());
  assert.equal(proof.confirmations, '12');
  assert.equal(proof.received, (10n * 10n ** 18n).toString());
});

test('rejects transactions on the wrong network', async () => {
  setEnv();
  mockRpc({ chainId: '0x1' });
  await assert.rejects(() => verifyBep20(TX, '10'), /WRONG_NETWORK/);
});

test('rejects transactions before 12 confirmations', async () => {
  setEnv();
  mockRpc({ head: '0x6e' });
  await assert.rejects(() => verifyBep20(TX, '10'), /TRANSACTION_NOT_CONFIRMED/);
});

test('rejects invalid token contracts instead of crediting', async () => {
  setEnv();
  mockRpc({ decimals: '0x' });
  await assert.rejects(() => verifyBep20(TX, '10'), /INVALID_TOKEN/);
});

test('rejects a mismatched claimed amount', async () => {
  setEnv();
  mockRpc();
  await assert.rejects(() => verifyBep20(TX, '11'), /TRANSFER_MISMATCH/);
});

test('rejects transfer logs that do not pay the shared address', async () => {
  setEnv();
  const receipt = {
    transactionHash: TX,
    status: '0x1',
    blockNumber: '0x64',
    logs: [{
      address: DEFAULT_USDT_BEP20_CONTRACT,
      topics: [TRANSFER_TOPIC, topicAddress('0x1111111111111111111111111111111111111111'), topicAddress('0x2222222222222222222222222222222222222222')],
      data: amount10,
    }],
  };
  mockRpc({ receipt });
  await assert.rejects(() => verifyBep20(TX, '10'), /TRANSFER_MISMATCH/);
});
