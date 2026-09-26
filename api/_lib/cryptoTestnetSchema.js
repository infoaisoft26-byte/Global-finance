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
  `);
  initialized = true;
}
