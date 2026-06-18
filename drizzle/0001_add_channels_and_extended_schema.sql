-- Migration: add channels table and extend schema for channel management
-- File: drizzle/0001_add_channels_and_extended_schema.sql

PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

-- Create channels table for managing different API providers (e.g., Cloudflare, OpenAI, Anthropic)
CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT,
    status INTEGER NOT NULL DEFAULT 1,
    config TEXT,
    createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Extend api_keys table with channel_id foreign key
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS channel_id TEXT;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL;

-- Extend model_pricing table with channel_id foreign key
ALTER TABLE model_pricing ADD COLUMN IF NOT EXISTS channel_id TEXT;
ALTER TABLE model_pricing ADD CONSTRAINT model_pricing_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL;

COMMIT;