-- =====================================================================
-- GLOBAL FINANCE - PRODUCTION POSTGRESQL & NEON SCHEMA SPECIFICATION
-- Database Engine: PostgreSQL 15+ / Neon Serverless Postgres
-- Design: Append-Only Immutable Financial Ledger & Multi-Tier Role Governance
-- =====================================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY, -- Firebase UID or internal UUID
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(32),
    referral_code VARCHAR(32) UNIQUE NOT NULL, -- Format: GF123456
    sponsor_id VARCHAR(32),                     -- Sponsor's referral_code
    role VARCHAR(32) NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- 'active' | 'suspended'
    kyc_status VARCHAR(32) NOT NULL DEFAULT 'unverified', -- 'unverified' | 'pending' | 'in_review' | 'verified' | 'rejected'
    pan_number VARCHAR(16),
    bank_account VARCHAR(64),
    bank_name VARCHAR(128),
    ifsc_code VARCHAR(16),
    upi_id VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_sponsor_id ON users(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users(kyc_status);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. WALLETS TABLE (Derived & Cached Balance Cache)
CREATE TABLE IF NOT EXISTS wallets (
    user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    fund_wallet NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    income_wallet NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    total_income NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    total_withdrawal NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    basic_package_active NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    fd_package_active NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    direct_team_count INT NOT NULL DEFAULT 0,
    total_team_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. LEDGER_TRANSACTIONS (Immutable Append-Only Header)
CREATE TABLE IF NOT EXISTS ledger_transactions (
    id VARCHAR(64) PRIMARY KEY, -- e.g. TXN12345678, DEP..., WTH...
    user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    type VARCHAR(64) NOT NULL, -- 'recharge' | 'package_activation' | 'p2p_transfer' | 'withdrawal' | 'admin_adjustment' etc.
    category VARCHAR(32) NOT NULL, -- 'fund_wallet' | 'income_wallet'
    flow VARCHAR(16) NOT NULL, -- 'credit' | 'debit'
    amount NUMERIC(16, 2) NOT NULL CHECK (amount > 0),
    fee NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    net_amount NUMERIC(16, 2) NOT NULL,
    description TEXT NOT NULL,
    reference_id VARCHAR(128),
    sender_user_id VARCHAR(64),
    recipient_user_id VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'completed', -- 'completed' | 'pending' | 'rejected' | 'failed'
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_txns_user_id ON ledger_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_txns_status ON ledger_transactions(status);
CREATE INDEX IF NOT EXISTS idx_ledger_txns_created_at ON ledger_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_txns_type ON ledger_transactions(type);

-- BEP20 deposits are server-owned. A TX hash can only be claimed once globally.
CREATE TABLE IF NOT EXISTS usdt_bep20_recharges (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    tx_hash VARCHAR(66) NOT NULL UNIQUE CHECK (tx_hash ~ '^0x[0-9a-f]{64}$'),
    deposit_address VARCHAR(42) NOT NULL CHECK (deposit_address ~ '^0x[0-9a-f]{40}$'),
    amount_usdt NUMERIC(28,8) NOT NULL CHECK (amount_usdt > 0),
    status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    credit_inr NUMERIC(16,2) CHECK (credit_inr > 0),
    ledger_id VARCHAR(64) UNIQUE REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
    proof_url TEXT,
    review_note TEXT,
    reviewed_by VARCHAR(64) REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (status <> 'approved' OR (credit_inr IS NOT NULL AND ledger_id IS NOT NULL AND reviewed_by IS NOT NULL)),
    CHECK (status <> 'rejected' OR reviewed_by IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_usdt_bep20_recharges_user ON usdt_bep20_recharges(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usdt_bep20_recharges_queue ON usdt_bep20_recharges(status,created_at);
-- Also exclude hashes credited by the retired self-service endpoint.
CREATE UNIQUE INDEX IF NOT EXISTS idx_usdt_bep20_ledger_txhash ON ledger_transactions(lower(reference_id))
  WHERE type IN ('crypto_deposit','usdt_bep20_recharge');

-- 4. PACKAGES DEFINITIONS (Database-driven configuration)
CREATE TABLE IF NOT EXISTS packages (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    code VARCHAR(64) UNIQUE NOT NULL,
    type VARCHAR(32) NOT NULL, -- 'basic' | 'fd'
    min_amount NUMERIC(16, 2) NOT NULL,
    max_amount NUMERIC(16, 2) NOT NULL,
    roi_rate NUMERIC(8, 4) NOT NULL, -- Daily percentage rate
    duration_days INT NOT NULL,
    description TEXT,
    terms TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. PACKAGE_ACTIVATIONS
CREATE TABLE IF NOT EXISTS package_activations (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    package_id VARCHAR(64) REFERENCES packages(id),
    package_type VARCHAR(32) NOT NULL,
    package_name VARCHAR(128) NOT NULL,
    amount NUMERIC(16, 2) NOT NULL CHECK (amount > 0),
    roi_daily_rate NUMERIC(8, 4) NOT NULL,
    duration_days INT NOT NULL,
    total_earned NUMERIC(16, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- 'active' | 'matured' | 'cancelled'
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pkg_act_user_id ON package_activations(user_id);
CREATE INDEX IF NOT EXISTS idx_pkg_act_status ON package_activations(status);

-- 6. KYC_SUBMISSIONS (Private compliance records)
CREATE TABLE IF NOT EXISTS kyc_submissions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    user_email VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255) NOT NULL,
    document_type VARCHAR(64) NOT NULL,
    document_last4 VARCHAR(8) NOT NULL,
    id_doc_name VARCHAR(255),
    id_doc_storage_path TEXT,
    address_doc_name VARCHAR(255),
    address_doc_storage_path TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending' | 'in_review' | 'verified' | 'rejected'
    admin_notes TEXT,
    reviewed_by VARCHAR(64),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kyc_user_id ON kyc_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_submissions(status);

-- 7. SUPPORT_TICKETS & MESSAGES
CREATE TABLE IF NOT EXISTS support_tickets (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id),
    user_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL,
    priority VARCHAR(32) NOT NULL DEFAULT 'normal',
    message TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'open', -- 'open' | 'in_progress' | 'resolved' | 'closed'
    admin_reply TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_messages (
    id VARCHAR(64) PRIMARY KEY,
    ticket_id VARCHAR(64) NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_id VARCHAR(64) NOT NULL,
    sender_role VARCHAR(32) NOT NULL, -- 'user' | 'admin'
    sender_name VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);

-- 8. AUDIT_LOGS (Immutable Security and Administrative Audit Trail)
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    actor_user_id VARCHAR(64) NOT NULL,
    actor_email VARCHAR(255),
    action VARCHAR(128) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);

-- 9. PLATFORM_SETTINGS
CREATE TABLE IF NOT EXISTS platform_settings (
    id VARCHAR(64) PRIMARY KEY,
    platform_name VARCHAR(128) NOT NULL DEFAULT 'GLOBAL FINANCE',
    payments_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
    min_withdrawal NUMERIC(16, 2) NOT NULL DEFAULT 500.00,
    withdrawal_fee_percent NUMERIC(8, 2) NOT NULL DEFAULT 5.00,
    support_email VARCHAR(255) NOT NULL DEFAULT 'support@globalfinance.digital',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 3A. UNIQUE BSC USDT DEPOSIT ADDRESSES & AUTOMATIC CREDIT EVENTS
CREATE SEQUENCE IF NOT EXISTS usdt_deposit_address_seq
  AS bigint
  START WITH 0
  MINVALUE 0;

CREATE TABLE IF NOT EXISTS usdt_deposit_addresses (
    user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    derivation_index BIGINT NOT NULL UNIQUE,
    address VARCHAR(42) NOT NULL UNIQUE CHECK (address ~ '^0x[0-9a-fA-F]{40}$'),
    network VARCHAR(16) NOT NULL DEFAULT 'BSC',
    token_symbol VARCHAR(16) NOT NULL DEFAULT 'USDT',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usdt_deposit_events (
    id VARCHAR(96) PRIMARY KEY,
    tx_hash VARCHAR(66) NOT NULL,
    log_index BIGINT NOT NULL,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    deposit_address VARCHAR(42) NOT NULL,
    token_address VARCHAR(42) NOT NULL,
    amount_usdt NUMERIC(40,18) NOT NULL CHECK (amount_usdt > 0),
    raw_amount NUMERIC(78,0) NOT NULL CHECK (raw_amount > 0),
    block_number BIGINT NOT NULL,
    confirmations INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'credited' CHECK (status IN ('credited','ignored','pending')),
    ledger_id VARCHAR(64) UNIQUE REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    credited_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_usdt_deposit_event_tx_log
  ON usdt_deposit_events(tx_hash, log_index);
CREATE INDEX IF NOT EXISTS idx_usdt_deposit_events_user
  ON usdt_deposit_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usdt_deposit_events_status_block
  ON usdt_deposit_events(status, block_number);

CREATE TABLE IF NOT EXISTS usdt_deposit_scan_state (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    last_scanned_block BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
