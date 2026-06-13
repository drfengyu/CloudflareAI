-- Phase B migration: extend users/api_key, add redemption/topup/option tables
-- Apply to D1 via `wrangler d1 execute <DB_NAME> --remote --file=migrations/0002_phase_b.sql`

-- 1. Extend users table
ALTER TABLE user ADD COLUMN role INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user ADD COLUMN balanceCredits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user ADD COLUMN "group" TEXT;
ALTER TABLE user ADD COLUMN status INTEGER NOT NULL DEFAULT 1;

-- 2. Extend api_key table (status, remainCredits, expiresAt, allowedModels, allowedIps, groupMultiplier)
-- SQLite doesn't support DROP COLUMN, so we keep the old `revoked` column and add new `status`.
-- App code will only read `status` (1=enabled, 2=disabled, 3=expired, 4=exhausted).
-- Migration note: existing rows have revoked=0 (false), map to status=1 (enabled).
ALTER TABLE api_key ADD COLUMN status INTEGER NOT NULL DEFAULT 1;
ALTER TABLE api_key ADD COLUMN remainCredits INTEGER;
ALTER TABLE api_key ADD COLUMN expiresAt INTEGER;
ALTER TABLE api_key ADD COLUMN allowedModels TEXT;
ALTER TABLE api_key ADD COLUMN allowedIps TEXT;
ALTER TABLE api_key ADD COLUMN groupMultiplier REAL DEFAULT 1.0;

-- Backfill status from revoked (revoked=1 → status=2, revoked=0 → status=1)
UPDATE api_key SET status = CASE WHEN revoked = 1 THEN 2 ELSE 1 END;

-- 3. Extend usage_log table (add creditsUsed)
ALTER TABLE usage_log ADD COLUMN creditsUsed INTEGER DEFAULT 0;

-- 4. Create redemption table
CREATE TABLE IF NOT EXISTS redemption (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  type INTEGER NOT NULL,
  quota INTEGER NOT NULL,
  usedCount INTEGER NOT NULL DEFAULT 0,
  maxUses INTEGER,
  expiresAt INTEGER,
  createdBy TEXT REFERENCES user(id) ON DELETE SET NULL,
  createdAt INTEGER NOT NULL
);

-- 5. Create topup table
CREATE TABLE IF NOT EXISTS topup (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type INTEGER NOT NULL,
  description TEXT,
  redemptionId TEXT REFERENCES redemption(id) ON DELETE SET NULL,
  createdAt INTEGER NOT NULL
);

-- 6. Create option table
CREATE TABLE IF NOT EXISTS "option" (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_redemption_code ON redemption(code);
CREATE INDEX IF NOT EXISTS idx_topup_userId ON topup(userId);
CREATE INDEX IF NOT EXISTS idx_topup_createdAt ON topup(createdAt);
CREATE INDEX IF NOT EXISTS idx_usage_log_userId ON usage_log(userId);
CREATE INDEX IF NOT EXISTS idx_usage_log_createdAt ON usage_log(createdAt);
