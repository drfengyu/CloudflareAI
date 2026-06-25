-- Fix api_key table: add missing encryptedKey column
-- Migration: 0006_add_encrypted_key_final
-- Date: 2025-06-25

-- Add encryptedKey column (the only missing column)
ALTER TABLE api_key ADD COLUMN encryptedKey TEXT;
