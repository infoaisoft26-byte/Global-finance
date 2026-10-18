import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { HDNodeWallet } from 'ethers';
import { addressGenerationConfigured, uniqueDepositConfigured } from '../api/_lib/usdtDeposit.js';

const keys = [
  'PAYMENTS_ENABLED',
  'USDT_RECHARGE_ENABLED',
  'PAYMENT_AUTO_CREDIT_ENABLED',
  'BSC_RPC_URL',
  'USDT_BEP20_CONTRACT_ADDRESS',
  'BSC_DEPOSIT_XPUB',
];
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const testXpub = HDNodeWallet.fromPhrase('test test test test test test test test test test test junk', undefined, "m/44'/60'/0'").neuter().extendedKey;
const contract = '0x55d398326f99059ff775485246999027b3197955';

after(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('deposit address configuration rejects missing or malformed xpub', () => {
  delete process.env.BSC_DEPOSIT_XPUB;
  assert.equal(addressGenerationConfigured(), false);
  process.env.BSC_DEPOSIT_XPUB = 'xpub-not-a-real-key';
  assert.equal(addressGenerationConfigured(), false);
});

test('valid public xpub can be used without private key material', () => {
  process.env.BSC_DEPOSIT_XPUB = testXpub;
  assert.equal(addressGenerationConfigured(), true);
});

test('automatic credit remains fail-closed unless all mainnet flags and canonical token are set', () => {
  Object.assign(process.env, {
    PAYMENTS_ENABLED: 'true',
    USDT_RECHARGE_ENABLED: 'true',
    PAYMENT_AUTO_CREDIT_ENABLED: 'true',
    BSC_RPC_URL: 'https://bsc-dataseed.bnbchain.org',
    USDT_BEP20_CONTRACT_ADDRESS: contract,
    BSC_DEPOSIT_XPUB: testXpub,
  });
  assert.equal(uniqueDepositConfigured(), true);
  process.env.USDT_BEP20_CONTRACT_ADDRESS = '0x' + '1'.repeat(40);
  assert.equal(uniqueDepositConfigured(), false);
});
