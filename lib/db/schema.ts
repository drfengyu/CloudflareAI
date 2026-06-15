import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";
import type { AdapterAccountType } from "next-auth/adapters";

/**
 * D1 (SQLite) schema. The first four tables follow the Auth.js Drizzle adapter
 * contract; the rest are app-specific (API keys, usage accounting, billing).
 *
 * Migrations are applied to D1 over HTTP via drizzle-kit (`driver: d1-http`),
 * runtime queries go through lib/db/d1-http.ts (sqlite-proxy → D1 REST).
 *
 * Phase B changes:
 * - users: +role/balanceCredits/group/status
 * - api_key: revoked→status (1/2/3/4), +remainCredits/expiresAt/allowedModels/allowedIps/groupMultiplier
 * - new: redemption, topup, option
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
  /** 1=普通 / 10=管理员 / 100=超管。首个注册用户或 ADMIN_EMAILS 环境变量命中→100。 */
  role: integer("role").notNull().default(1),
  /** 整数积分余额（1 credit = $0.01, CREDITS_PER_USD = 100）。 */
  balanceCredits: integer("balanceCredits").notNull().default(0),
  /** 用户分组，影响倍率 (Phase F 实现分组倍率设置)。 */
  group: text("group"),
  /** 1=启用 / 2=禁用 / 3=已删除。 */
  status: integer("status").notNull().default(1),
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
  /** 1=启用 / 2=禁用 / 3=过期 / 4=额度耗尽 (migrated from revoked boolean). */
  status: integer("status").notNull().default(1),
  /** 初始总额度（整数 credits）；null = 无限额度。创建时设置，用于计算进度条。 */
  quotaCredits: integer("quotaCredits"),
  /** 剩余额度（整数 credits）；null = 无限额度。 */
  remainCredits: integer("remainCredits"),
  /** 有效期截止时间；null = 永不过期。 */
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }),
  /** 允许的模型白名单（JSON array of model IDs）；null = 所有模型。 */
  allowedModels: text("allowedModels"),
  /** 允许的 IP 白名单（逗号分隔）；null = 不限制。 */
  allowedIps: text("allowedIps"),
  /** 分组倍率覆盖（若设置则覆盖用户分组倍率）。 */
  groupMultiplier: real("groupMultiplier").default(1.0),
  lastUsedAt: integer("lastUsedAt", { mode: "timestamp_ms" }),
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
  /** 本次调用消耗的 credits（从 Phase B 起计量生效）。 */
  creditsUsed: integer("creditsUsed").default(0),
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

/** 兑换码表：用于充值、邀请等场景。 */
export const redemptions = sqliteTable("redemption", {
  id: text("id").primaryKey().$defaultFn(uuid),
  /** 兑换码明文（建议 base58/nanoid，8-16 字符）。 */
  code: text("code").notNull().unique(),
  /** 1=充值 / 2=邀请 / 3=一次性试用。 */
  type: integer("type").notNull(),
  /** 每次兑换赠送的 credits。 */
  quota: integer("quota").notNull(),
  /** 已兑换次数。 */
  usedCount: integer("usedCount").notNull().default(0),
  /** 最大兑换次数；null = 无限次（慎用）。 */
  maxUses: integer("maxUses"),
  /** 过期时间；null = 永不过期。 */
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }),
  /** 创建者用户 ID（管理员）。 */
  createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
});

/** 余额流水表：记录每次充值、扣减、管理员调整。 */
export const topups = sqliteTable("topup", {
  id: text("id").primaryKey().$defaultFn(uuid),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** 变动金额（credits，可正可负）。 */
  amount: integer("amount").notNull(),
  /** 1=兑换码充值 / 2=管理员手动调整 / 3=消费扣减（暂不用，消费记 usage_log） / 4=其他。 */
  type: integer("type").notNull(),
  /** 描述：如"兑换码 ABC123"、"管理员充值"、"后台调整"。 */
  description: text("description"),
  /** 关联兑换码 ID（type=1 时填写）。 */
  redemptionId: text("redemptionId").references(() => redemptions.id, {
    onDelete: "set null",
  }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
});

/** 系统设置 KV 表：存放全局配置项，value 为 JSON 字符串。 */
export const options = sqliteTable("option", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).$defaultFn(now),
});

/** 对话历史表：保存文本生成的 prompt 和 response（Phase C 扩展）。 */
export const conversationHistory = sqliteTable("conversation_history", {
  id: text("id").primaryKey().$defaultFn(uuid),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** 会话 ID，用于分组同一会话的多轮对话；null = 单次对话。 */
  sessionId: text("sessionId"),
  model: text("model").notNull(),
  prompt: text("prompt").notNull(),
  response: text("response").notNull(),
  inputTokens: integer("inputTokens").notNull().default(0),
  outputTokens: integer("outputTokens").notNull().default(0),
  creditsUsed: integer("creditsUsed").notNull().default(0),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
});

export type User = typeof users.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type UsageLog = typeof usageLogs.$inferSelect;
export type Redemption = typeof redemptions.$inferSelect;
export type Topup = typeof topups.$inferSelect;
export type Option = typeof options.$inferSelect;
export type ConversationHistory = typeof conversationHistory.$inferSelect;
