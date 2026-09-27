import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchNileAccount, isMatchingBuyTransfer, isMatchingConfirmedTransfer, isTronAddress } from '../api/_lib/tronTestnet.js';

const treasury = 'TGvi8RYS4JDWFn3TPrcK6fE3wXtJncvbkF';
const user = 'TUoHaVjx7n5xz8LwPRDckgFrDWhMhuSuJM';
const contract = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';
const config = { depositAddress: treasury, contractAddress: contract, decimals: 6 };
const now = new Date('2026-09-27T08:00:00Z');

test('only a distinct sender paying the correct treasury and token can credit a sell', () => {
  const intent = { expected_amount_atomic: '100000000', created_at: now, expires_at: new Date(now.getTime() + 1800000) };
  const tx = { type: 'Transfer', from: user, to: treasury, value: '100000000', token_info: { address: contract }, block_timestamp: now.getTime() + 5000 };
  assert.equal(isMatchingConfirmedTransfer(tx, intent, config), true);
  assert.equal(isMatchingConfirmedTransfer({ ...tx, from: treasury }, intent, config), false);
  assert.equal(isMatchingConfirmedTransfer({ ...tx, to: user }, intent, config), false);
  assert.equal(isMatchingConfirmedTransfer({ ...tx, token_info: { address: user } }, intent, config), false);
});

test('buy settlement requires exact confirmed outgoing test USDT transfer', () => {
  const order = { recipient_address: user, amount_usdt: '2.000001', created_at: now };
  const tx = { transaction_id: 'f'.repeat(64), type: 'Transfer', from: treasury, to: user, value: '2000001', token_info: { address: contract }, block_timestamp: now.getTime() + 1000 };
  assert.equal(isMatchingBuyTransfer(tx, order, config, tx.transaction_id), true);
  assert.equal(isMatchingBuyTransfer({ ...tx, value: '2000000' }, order, config, tx.transaction_id), false);
  assert.equal(isMatchingBuyTransfer({ ...tx, from: user }, order, config, tx.transaction_id), false);
  assert.equal(isMatchingBuyTransfer(tx, order, config, 'a'.repeat(64)), false);
  assert.equal(isMatchingBuyTransfer({ ...tx, block_timestamp: now.getTime() - 70000 }, order, config, tx.transaction_id), false);
});

test('Nile account lookup displays only TRX and the fixed Nile test USDT contract', async t => {
  assert.equal(isTronAddress(treasury), true);
  assert.equal(isTronAddress('bad'), false);
  const prior = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true, data: [{ balance: 1000000000, trc20: [{ [contract]: '1000000000' }, { [user]: '999000000' }] }] }) });
  t.after(() => { globalThis.fetch = prior; });
  assert.deepEqual(await fetchNileAccount(treasury), { trx: 1000, usdt: 1000 });
});
