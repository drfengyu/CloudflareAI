-- Fix api_key table structure
-- Migration: 0005_fix_api_key_schema
-- Date: 2025-06-25
-- Fix: Add all missing columns from Phase B and Channel Management

-- 1. Add encryptedKey (fix 0004 migration which used wrong table name)
ALTER TABLE api_key ADD COLUMN encryptedKey TEXT;

-- 2. Add status column (1=enabled, 2=disabled, 3=expired, 4=depleted)
ALTER TABLE api_key ADD COLUMN status INTEGER NOT NULL DEFAULT 1;

-- 3. Add quota and credit tracking
ALTER TABLE api_key ADD COLUMN quotaCredits REAL;
ALTER TABLE api_key ADD COLUMN remainCredits REAL;

-- 4. Add expiration and restrictions
ALTER TABLE api_key ADD COLUMN expiresAt INTEGER;
ALTER TABLE api_key ADD COLUMN allowedModels TEXT;
ALTER TABLE api_key ADD COLUMN allowedIps TEXT;

-- 5. Add group multiplier
ALTER TABLE api_key ADD COLUMN groupMultiplier REAL DEFAULT 1.0;

-- 6. Add channel reference
ALTER TABLE api_key ADD COLUMN channelId TEXT REFERENCES channels(id) ON DELETE SET NULL;

-- 7. Migrate revoked field to status
-- revoked=1 → status=2 (disabled)
-- revoked=0 → status=1 (enabled)
UPDATE api_key SET status = CASE WHEN revoked = 1 THEN 2 ELSE 1 END;

-- Note: We keep the revoked column for backward compatibility
-- It will be removed in a future migration after confirming status works
