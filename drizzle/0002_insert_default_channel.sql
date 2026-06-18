-- Migration: insert default channel and set existing records to use it
-- File: drizzle/0002_insert_default_channel.sql

PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

-- Insert a default channel if it doesn't exist
INSERT OR IGNORE INTO channels (id, name, type, status, config, createdAt)
VALUES ('default-cloudflare', 'Default Cloudflare', 'cloudflare', 1, NULL, (strftime('%s','now')));

-- Update existing api_keys to use the default channel where channelId is null
UPDATE api_keys
SET channelId = 'default-cloudflare'
WHERE channelId IS NULL;

-- Update existing model_pricing to use the default channel where channelId is null
UPDATE model_pricing
SET channelId = 'default-cloudflare'
WHERE channelId IS NULL;

COMMIT;