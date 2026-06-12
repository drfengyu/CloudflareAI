import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";
import type { AdapterAccountType } from "next-auth/adapters";

/**
 * D1 (SQLite) schema. The first four tables follow the Auth.js Drizzle adapter
 * contract; the rest are app-specific (API keys, usage accounting, quotas).
 *
 * Migrations are applied to D1 over HTTP via drizzle-kit (`driver: d1-http`),
 * runtime queries go through lib/db/d1-http.ts (sqlite-proxy → D1 REST).
 */

const uuid = () => crypto.randomUUID();
const now = () => new Date();

// ── Auth.js ──────────────────────────────────────────────────────────────
export const users = sqliteTable("user", {
  id: text("id").primaryKey().$defaultFn(uuid),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
  /** Set for email/password (Credentials) users; null for OAuth-only users. */
  passwordHash: text("passwordHash"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
});

export const accounts = sqliteTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = sqliteTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// ── App tables ───────────────────────────────────────────────────────────
export const apiKeys = sqliteTable("api_key", {
  id: text("id").primaryKey().$defaultFn(uuid),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Visible prefix, e.g. `sk-cfai-AbC1`, for display in the UI. */
  prefix: text("prefix").notNull(),
  /** SHA-256 hex of the full key; the plaintext is shown only once. */
  keyHash: text("keyHash").notNull().unique(),
  lastUsedAt: integer("lastUsedAt", { mode: "timestamp_ms" }),
  revoked: integer("revoked", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
});

export const usageLogs = sqliteTable("usage_log", {
  id: text("id").primaryKey().$defaultFn(uuid),
  userId: text("userId").notNull(),
  apiKeyId: text("apiKeyId"),
  model: text("model").notNull(),
  task: text("task"),
  /** hosted | proxied — proxied bypasses the neuron free tier. */
  source: text("source"),
  /** web | openai | anthropic — which surface issued the call. */
  channel: text("channel").notNull(),
  inputTokens: integer("inputTokens").default(0),
  outputTokens: integer("outputTokens").default(0),
  neurons: real("neurons").default(0),
  costUsd: real("costUsd").default(0),
  /** ok | error */
  status: text("status").notNull(),
  latencyMs: integer("latencyMs"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
});

export const quotas = sqliteTable("quota", {
  userId: text("userId")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  dailyNeuronLimit: integer("dailyNeuronLimit").notNull().default(10_000),
  monthlyNeuronLimit: integer("monthlyNeuronLimit"),
});

export type User = typeof users.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type UsageLog = typeof usageLogs.$inferSelect;
