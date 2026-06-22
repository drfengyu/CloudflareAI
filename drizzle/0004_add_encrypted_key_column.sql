-- Add encryptedKey column to api_keys table
-- Migration: 0004_add_encrypted_key_column
-- Date: 2026-06-22

ALTER TABLE api_keys ADD COLUMN encryptedKey TEXT;
