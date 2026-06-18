-- Migration: add channel_id to usage_log and update existing records
-- File: drizzle/0003_add_channel_id_to_usage_logs.sql

PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

-- Add channel_id column to usage_logs
ALTER TABLE usage_log ADD COLUMN IF NOT EXISTS channel_id TEXT;
ALTER TABLE usage_log ADD CONSTRAINT usage_log_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL;

-- Update existing usage_log records to set channel_id based on channel field
-- This maps existing channel values to the default cloudflare channel
UPDATE usage_log
SET channel_id = 'default-cloudflare'
WHERE channel = 'openai' OR channel = 'anthropic' OR channel = 'web';

-- Any records without a matching channel remain NULL (backward compatible)

COMMIT;
