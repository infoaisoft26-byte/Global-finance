import { getPool } from './db.js';

let initialized = false;

export async function ensureCryptoTestnetSchema() {
  if (initialized) return;
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS crypto_deposit_intents (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      network VARCHAR(32) NOT NULL DEFAULT 'SHASTA',
      token VARCHAR(32) NOT NULL DEFAULT 'USDT-TEST',
      deposit_address VARCHAR(128) NOT NULL,
      token_contract VARCHAR(128) NOT NULL,
      token_decimals INT NOT NULL DEFAULT 6,
      expected_amount_atomic BIGINT NOT NULL CHECK (expected_amount_atomic > 0),
      expected_amount_usdt NUMERIC(20, 6) NOT NULL CHECK (expected_amount_usdt > 0),
      requested_amount_inr NUMERIC(16, 2) NOT NULL CHECK (requested_amount_inr > 0),
      rate_inr_per_usdt NUMERIC(16, 6) NOT NULL CHECK (rate_inr_per_usdt > 0),
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      txid VARCHAR(128) UNIQUE,
      sender_address VARCHAR(128),
      block_timestamp BIGINT,
      expires_at TIMESTAMPTZ NOT NULL,
      credited_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_crypto_deposit_user_created
      ON crypto_deposit_intents(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_crypto_deposit_status_expiry
      ON crypto_deposit_intents(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_crypto_deposit_address_amount
      ON crypto_deposit_intents(deposit_address, expected_amount_atomic);
    CREATE TABLE IF NOT EXISTS test_wallets (
      user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      balance_inr NUMERIC(16, 2) NOT NULL DEFAULT 0 CHECK (balance_inr >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS test_wallet_entries (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_inr NUMERIC(16, 2) NOT NULL CHECK (amount_inr <> 0),
      kind VARCHAR(32) NOT NULL,
      reference_id VARCHAR(128) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS test_buy_orders (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_address VARCHAR(64) NOT NULL,
      amount_inr NUMERIC(16, 2) NOT NULL CHECK (amount_inr > 0),
      amount_usdt NUMERIC(20, 6) NOT NULL CHECK (amount_usdt > 0),
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      txid VARCHAR(128) UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_test_buy_user ON test_buy_orders(user_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_test_buy_one_pending ON test_buy_orders(user_id) WHERE status='pending';
  `);
  initialized = true;
}
