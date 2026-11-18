CREATE TABLE IF NOT EXISTS perm_indexer_state (
  chain_id INTEGER NOT NULL,
  router TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, router, key)
);

CREATE TABLE IF NOT EXISTS perm_settlements (
  chain_id INTEGER NOT NULL,
  router TEXT NOT NULL,
  router_version INTEGER NOT NULL,
  transaction_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash TEXT,
  block_timestamp BIGINT,
  receipt_id TEXT NOT NULL,
  quote_id TEXT NOT NULL,
  account TEXT NOT NULL,
  recipient TEXT NOT NULL,
  token_in TEXT NOT NULL,
  token_out TEXT NOT NULL,
  amount_in NUMERIC(78,0) NOT NULL,
  routed_input NUMERIC(78,0) NOT NULL,
  amount_out NUMERIC(78,0) NOT NULL,
  gross_fee NUMERIC(78,0) NOT NULL,
  rebate NUMERIC(78,0) NOT NULL,
  net_fee NUMERIC(78,0) NOT NULL,
  referral_fee NUMERIC(78,0) NOT NULL,
  treasury_fee NUMERIC(78,0) NOT NULL DEFAULT 0,
  policy_version INTEGER NOT NULL,
  route_id TEXT NOT NULL,
  route_hash TEXT,
  legacy BOOLEAN NOT NULL DEFAULT FALSE,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, router, transaction_hash, log_index)
);

CREATE INDEX IF NOT EXISTS perm_settlements_account_history
  ON perm_settlements (chain_id, router, account, block_number DESC, log_index DESC);
CREATE UNIQUE INDEX IF NOT EXISTS perm_settlements_event_identity
  ON perm_settlements (chain_id, router, transaction_hash, receipt_id);
CREATE INDEX IF NOT EXISTS perm_settlements_receipt
  ON perm_settlements (chain_id, router, receipt_id);

CREATE TABLE IF NOT EXISTS perm_route_steps (
  chain_id INTEGER NOT NULL,
  router TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash TEXT,
  receipt_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  provider_id TEXT NOT NULL,
  adapter TEXT NOT NULL,
  token_in TEXT NOT NULL,
  token_out TEXT NOT NULL,
  amount_in NUMERIC(78,0) NOT NULL,
  amount_out NUMERIC(78,0) NOT NULL,
  step_route_id TEXT NOT NULL,
  hook TEXT NOT NULL,
  hook_codehash TEXT,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, router, transaction_hash, log_index)
);

CREATE INDEX IF NOT EXISTS perm_route_steps_receipt
  ON perm_route_steps (chain_id, router, receipt_id, step_index);
CREATE UNIQUE INDEX IF NOT EXISTS perm_route_steps_identity
  ON perm_route_steps (chain_id, router, receipt_id, step_index);

ALTER TABLE perm_settlements ADD COLUMN IF NOT EXISTS block_hash TEXT;
ALTER TABLE perm_route_steps ADD COLUMN IF NOT EXISTS block_hash TEXT;
ALTER TABLE perm_route_steps ADD COLUMN IF NOT EXISTS hook_codehash TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'perm_route_steps_settlement_fk'
  ) THEN
    ALTER TABLE perm_route_steps
      ADD CONSTRAINT perm_route_steps_settlement_fk
      FOREIGN KEY (chain_id, router, transaction_hash, receipt_id)
      REFERENCES perm_settlements (chain_id, router, transaction_hash, receipt_id)
      ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;
