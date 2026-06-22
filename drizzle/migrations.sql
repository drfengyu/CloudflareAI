-- Cloudflare D1 Migration
-- Generated from drizzle/0000_violet_famine.sql

CREATE TABLE IF NOT EXISTS `account` (
	`userId` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`providerAccountId` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	PRIMARY KEY(`provider`, `providerAccountId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `api_key` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`keyHash` text NOT NULL,
	`lastUsedAt` integer,
	`revoked` integer DEFAULT false NOT NULL,
	`createdAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS `api_key_keyHash_unique` ON `api_key` (`keyHash`);

CREATE TABLE IF NOT EXISTS `quota` (
	`userId` text PRIMARY KEY NOT NULL,
	`dailyNeuronLimit` integer DEFAULT 10000 NOT NULL,
	`monthlyNeuronLimit` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `session` (
	`sessionToken` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `usage_log` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`apiKeyId` text,
	`model` text NOT NULL,
	`task` text,
	`source` text,
	`channel` text NOT NULL,
	`inputTokens` integer DEFAULT 0,
	`outputTokens` integer DEFAULT 0,
	`neurons` real DEFAULT 0,
	`costUsd` real DEFAULT 0,
	`status` text NOT NULL,
	`latencyMs` integer,
	`createdAt` integer
);

CREATE TABLE IF NOT EXISTS `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`emailVerified` integer,
	`image` text,
	`passwordHash` text,
	`createdAt` integer
);

CREATE UNIQUE INDEX IF NOT EXISTS `user_email_unique` ON `user` (`email`);

CREATE TABLE IF NOT EXISTS `verificationToken` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);

-- Migration 0004: Add encryptedKey column to api_keys table (2026-06-22)
ALTER TABLE api_key ADD COLUMN encryptedKey TEXT;

