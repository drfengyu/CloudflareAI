-- Migration: Add quotaCredits column to api_key table
-- Date: 2026-06-15
-- Purpose: Store initial quota for progress bar calculation

ALTER TABLE api_key ADD COLUMN quotaCredits INTEGER;

-- Set quotaCredits = remainCredits for existing keys with limited quota
UPDATE api_key SET quotaCredits = remainCredits WHERE remainCredits IS NOT NULL;
