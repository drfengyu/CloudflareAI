import { sqliteTable, text, integer, real, primaryKey, unique, index } from "drizzle-orm/sqlite-core";
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
  /** 永久余额（1 credit = $1 USD, CREDITS_PER_USD = 1）。管理员充值到此。支持小数。 */
  balanceCredits: real("balanceCredits").notNull().default(0),
  /** 用户分组，影响倍率 (Phase F 实现分组倍率设置)。 */
  group: text("group"),
  /** 1=启用 / 2=禁用 / 3=已删除。 */
  status: integer("status").notNull().default(1),
  /** LinuxDO 用户 ID（OAuth 绑定）。 */
  linuxdoId: text("linuxdoId").unique(),
  /** LinuxDO 信任等级（0-4）。 */
  linuxdoTrustLevel: integer("linuxdoTrustLevel"),
  /** 邀请码（12 位小写十六进制）；老用户在首次打开邀请页时补发。 */
  inviteCode: text("inviteCode").unique(),
  /** 邀请人用户 ID（仅邮箱注册且携带有效邀请码时写入）。 */
  invitedBy: text("invitedBy"),
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
/** 渠道表：管理不同的 API 提供商（Cloudflare / OpenAI / Anthropic 等）。 */
export const channels = sqliteTable("channels", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  /** 渠道类型：cloudflare / openai / anthropic / azure 等。 */
  type: text("type"),
  /** 1=启用 / 2=禁用 / 3=已删除。 */
  status: integer("status").notNull().default(1),
  /** 渠道配置（JSON 字符串），如 API Key、Base URL 等。 */
  config: text("config"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
});

export type Channel = typeof channels.$inferSelect;

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
  /** Encrypted full key (AES-256-GCM), can be decrypted for display. */
  encryptedKey: text("encryptedKey"),
  /** 1=启用 / 2=禁用 / 3=过期 / 4=额度耗尽 (migrated from revoked boolean). */
  status: integer("status").notNull().default(1),
  /** 初始总额度（credits）；null = 无限额度。支持小数。 */
  quotaCredits: real("quotaCredits"),
  /** 剩余额度（credits）；null = 无限额度。支持小数。 */
  remainCredits: real("remainCredits"),
  /** 有效期截止时间；null = 永不过期。 */
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }),
  /** 允许的模型白名单（JSON array of model IDs）；null = 所有模型。 */
  allowedModels: text("allowedModels"),
  /** 允许的 IP 白名单（逗号分隔）；null = 不限制。 */
  allowedIps: text("allowedIps"),
  /** 分组倍率覆盖（若设置则覆盖用户分组倍率）。 */
  groupMultiplier: real("groupMultiplier").default(1.0),
  /** 渠道ID，关联到 channels 表 */
  channelId: text("channelId").references(() => channels.id, { onDelete: "set null" }),
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
  /** 渠道ID，关联到 channels 表 */
  channelId: text("channelId").references(() => channels.id, { onDelete: "set null" }),
  inputTokens: integer("inputTokens").default(0),
  outputTokens: integer("outputTokens").default(0),
  neurons: real("neurons").default(0),
  /** 本次调用消耗的 credits（从 Phase B 起计量生效）。支持小数。 */
  creditsUsed: real("creditsUsed").default(0),
  costUsd: real("costUsd").default(0),
  /** ok | error */
  status: text("status").notNull(),
  /** error 时的错误原因 */
  errorReason: text("errorReason"),
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
  /** 每次兑换赠送的 credits（支持小数）。 */
  quota: real("quota").notNull(),
  /** 已兑换次数。 */
  usedCount: integer("usedCount").notNull().default(0),
  /** 最大兑换次数；null = 无限次（慎用）。 */
  maxUses: integer("maxUses"),
  /** 兑换码本身的过期时间；null = 永不过期。 */
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }),
  /** 充值后余额的有效期（天数）；null = 永久有效。兑换时计算为 now + balanceValidDays。 */
  balanceValidDays: integer("balanceValidDays"),
  /** 使用者用户 ID（最后一次使用）。 */
  usedUserId: text("usedUserId").references(() => users.id, { onDelete: "set null" }),
  /** 最后兑换时间。 */
  redeemedAt: integer("redeemedAt", { mode: "timestamp_ms" }),
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
  /** 变动金额（credits，可正可负，支持小数）。 */
  amount: real("amount").notNull(),
  /** 1=兑换码充值 / 2=管理员手动调整 / 3=签到奖励 / 4=其他（新用户注册奖励） / 5=在线充值 / 6=限时活动抽奖（买券与倒扣为负） / 7=邀请奖励 / 8=消费返利 / 9=任务成就 / 10=充值赠送 / 11=雷电行动（装备/复活为负、通关奖励为正）。 */
  type: integer("type").notNull(),
  /** 描述：如"兑换码 ABC123"、"管理员充值"、"后台调整"。 */
  description: text("description"),
  /** 关联兑换码 ID（type=1 时填写）。 */
  redemptionId: text("redemptionId").references(() => redemptions.id, {
    onDelete: "set null",
  }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
});

/** 签到记录表：每日签到获得随机额度奖励。 */
export const checkins = sqliteTable(
  "checkin",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 签到日期：YYYY-MM-DD 格式。 */
    checkinDate: text("checkinDate").notNull(),
    /** 本次签到奖励的 credits。 */
    quotaAwarded: real("quotaAwarded").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
  },
  (table) => ({
    // 每人每天只能签到一次
    uniqueUserDate: unique().on(table.userId, table.checkinDate),
  })
);

export type Checkin = typeof checkins.$inferSelect;

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

/**
 * 聊天会话：站内 `/chat` 的一级容器。
 * `conversation_history` 一次调用一行的快照，承担不了标题/置顶/分享，故另起表。
 */
export const chatSessions = sqliteTable(
  "chat_session",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("新对话"),
    /** 会话默认模型；单条消息上另有 model，中途换模型也能追溯。 */
    model: text("model").notNull(),
    systemPrompt: text("systemPrompt"),
    /** 1=置顶，列表排在前面。 */
    pinned: integer("pinned").notNull().default(0),
    /** 分享令牌；null=未分享。公开页 /s/[token] 按它只读渲染。 */
    shareToken: text("shareToken").unique(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
    lastMessageAt: integer("lastMessageAt", { mode: "timestamp_ms" }).$defaultFn(now),
  },
  (table) => [
    index("idx_chat_session_user_list").on(table.userId, table.pinned, table.lastMessageAt),
  ],
);

/** 聊天消息：一行一条消息，`seq` 在会话内递增且唯一，用于稳定排序与「重新生成」截断。 */
export const chatMessages = sqliteTable(
  "chat_message",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    sessionId: text("sessionId")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    role: text("role").$type<"system" | "user" | "assistant">().notNull(),
    model: text("model"),
    content: text("content").notNull(),
    /** 推理模型的思考内容；null=无。 */
    reasoning: text("reasoning"),
    creditsUsed: real("creditsUsed").notNull().default(0),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
  },
  (table) => [
    unique("uq_chat_message_seq").on(table.sessionId, table.seq),
    index("idx_chat_message_session").on(table.sessionId, table.seq),
  ],
);

/** 临时余额表：有过期时间的余额（兑换码充值到此）。 */
export const temporaryBalances = sqliteTable("temporary_balance", {
  id: text("id").primaryKey().$defaultFn(uuid),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** 临时余额金额（credits）。支持小数。 */
  amount: real("amount").notNull(),
  /** 过期时间。 */
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }).notNull(),
  /** 关联的兑换码 ID（可选）。 */
  redemptionId: text("redemptionId").references(() => redemptions.id, {
    onDelete: "set null",
  }),
  /** 描述：如"兑换码 ABC123 充值"。 */
  description: text("description"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
});

/** 模型价格表：统一管理所有模型的计费/显示价格。
 * - 价格 = catalog 官方价 × 1000（基础价），再按规则 < $100 时 ×5。
 * - 文本模型：inputPrice/outputPrice 单位为 $/1M tokens。
 * - 图像模型：fixedPrice 单位为 $/张，isImage=1。
 * - multiplier 为管理员可调整的倍率（默认 1.0），最终价格 = 基础价格 × multiplier。
 * - 计费和 UI 显示都从此表读取。
 * - channelId 关联到 channels 表，支持按渠道定制定价。
 */
export const modelPricing = sqliteTable("model_pricing", {
  modelId: text("modelId").primaryKey(),
  category: text("category"),
  source: text("source"),
  /** 输入价格（cr/1M tokens，不含基础倍率与模型倍率）。 */
  inputPrice: real("inputPrice"),
  /** 输出价格（cr/1M tokens）。null 表示与输入价相同。 */
  outputPrice: real("outputPrice"),
  /** 计费单位描述（如 "per M input tokens" / "image"）。 */
  unit: text("unit"),
  /** 是否为图像模型（固定价格）。 */
  isImage: integer("isImage").default(0),
  /** 图像模型的固定价格（$/张），仅 isImage=1 时有效。 */
  fixedPrice: real("fixedPrice"),
  /** 管理员可调整的定价倍率（默认 1.0）。最终价格 = 基础价格 × multiplier。 */
  multiplier: real("multiplier").default(1.0).notNull(),
  /**
   * 余额预检假定的输出 token 数（默认 1024）。客户端的 max_tokens 超过它时，
   * 预检按它算——否则 Claude Code 一类默认 32000 会把请求全量预留后直接 402。
   * null = 用默认值。
   */
  reserveOutputTokens: integer("reserveOutputTokens").default(1024),
  /** 渠道ID，关联到 channels 表 */
  channelId: text("channelId").references(() => channels.id, { onDelete: "set null" }),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).$defaultFn(now),
});

/** 注册日志表：记录每次注册的 IP、邮箱、时间等信息，用于频率限制。 */
export const registrationLog = sqliteTable("registration_log", {
  id: text("id").primaryKey().$defaultFn(uuid),
  /** 注册时的 IP 地址。 */
  ip: text("ip").notNull(),
  /** 注册的邮箱地址。 */
  email: text("email").notNull(),
  /** 注册时间戳。 */
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
  /** 用户代理字符串。 */
  userAgent: text("userAgent"),
});

/**
 * 邀请记录：一个被邀请人只能有一条（`inviteeId` 唯一）。
 * 奖励金额在注册当时锁定，之后改后台配置不影响历史记录。
 */
export const inviteRecords = sqliteTable(
  "invite_record",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    inviterId: text("inviterId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inviteeId: text("inviteeId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 实际发给邀请人的 credits（命中每日上限时为 0）。 */
    inviterReward: real("inviterReward").notNull().default(0),
    /** 实际发给被邀请人的 credits。 */
    inviteeReward: real("inviteeReward").notNull().default(0),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
  },
  (table) => [
    unique("uq_invite_record_invitee").on(table.inviteeId),
    index("idx_invite_record_inviter").on(table.inviterId, table.createdAt),
  ],
);

/**
 * 消费返利领取记录：一个自然日一行，`periodDate` 是北京时间口径的 `YYYY-MM-DD`。
 * 当日消费与实发额度都在领取当时快照下来——之后改定价、改比例都不该让历史返利变数。
 */
export const cashbackClaims = sqliteTable(
  "cashback_claim",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    periodDate: text("periodDate").notNull(),
    /** 该日实际消费（credits），按 usage_log 汇总快照。 */
    consumedCredits: real("consumedCredits").notNull().default(0),
    /** 本次实发（credits），已按门槛与封顶裁过。 */
    rewardCredits: real("rewardCredits").notNull().default(0),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
  },
  (table) => [
    // 一天只能领一次；并发重复领取由这条唯一索引挡（与签到同构）
    unique("uq_cashback_claim").on(table.userId, table.periodDate),
    index("idx_cashback_claim_period").on(table.periodDate),
  ],
);

/**
 * 任务成就领取记录：一行 = 一个用户领取过某个任务，之后不再重复发。
 * 完成判定读的是各业务表的现场数据（见 `lib/tasks/tasks.ts`），这张表只记「领过」，不存进度。
 */
export const userTasks = sqliteTable(
  "user_task",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskKey: text("taskKey").notNull(),
    /** 领取当时实发的 credits；之后改后台奖励不影响历史。 */
    rewardCredits: real("rewardCredits").notNull().default(0),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
  },
  (table) => [unique("uq_user_task").on(table.userId, table.taskKey)],
);

/** 支付订单表：记录易支付（彩虹易支付）在线充值订单。 */
export const paymentOrders = sqliteTable("payment_order", {
  id: text("id").primaryKey().$defaultFn(uuid),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** 商户订单号（易支付 out_trade_no）。 */
  orderNo: text("orderNo").notNull().unique(),
  /** 易支付流水号（回调后写入）。 */
  tradeNo: text("tradeNo"),
  /** 支付金额（元，CNY）。 */
  amountCny: real("amountCny").notNull(),
  /** 应发放 credits（下单时按 recharge_rate 锁定）。 */
  credits: real("credits").notNull(),
  /** 0=待支付 / 1=已支付待发货 / 2=已发货 / 3=已关闭 / 9=异常。 */
  status: integer("status").notNull().default(0),
  /** 支付渠道：alipay / wechat / qqpay。 */
  channel: text("channel"),
  /** 回调原文（审计用）。 */
  notifyPayload: text("notifyPayload"),
  /** 支付时间。 */
  paidAt: integer("paidAt", { mode: "timestamp_ms" }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
});

export type User = typeof users.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type UsageLog = typeof usageLogs.$inferSelect;
export type Redemption = typeof redemptions.$inferSelect;
export type Topup = typeof topups.$inferSelect;
export type Option = typeof options.$inferSelect;
export type ConversationHistory = typeof conversationHistory.$inferSelect;
export type TemporaryBalance = typeof temporaryBalances.$inferSelect;
export type ModelPricing = typeof modelPricing.$inferSelect;
export type RegistrationLog = typeof registrationLog.$inferSelect;
export type PaymentOrder = typeof paymentOrders.$inferSelect;
export type InviteRecord = typeof inviteRecords.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;

/**
 * 限时活动·抽奖券。一行 = 一张券，消耗方式是回填 `usedDrawId`：
 * 「券」是用户已经付过 cr 的凭证，条件更新（`WHERE usedDrawId IS NULL`）是这里唯一
 * 可靠的双花防护——D1 走 REST，没有事务，读改写会在并发下重复开奖。
 */
export const lotteryTickets = sqliteTable(
  "lottery_ticket",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** buy=花 credits 买的 / gift=累抽档位赠送的 / prize=转盘抽中的赠券档。 */
    source: text("source").$type<"buy" | "gift" | "prize">().notNull(),
    /** 该券的单券价（cr）；赠券记 0，仅用于流水对账。 */
    priceCredits: real("priceCredits").notNull().default(0),
    /** 赠送时命中的累抽档位（当时的总抽奖次数）；非档位赠券为 null。 */
    milestoneDraws: integer("milestoneDraws"),
    /**
     * 同一档位内的第几张（0 起）。唯一索引必须带上它：送 3 张的档位若三行都记同一个
     * `(userId, milestoneDraws)`，第二行就会撞索引、整批发不出去——线上正是这样导致
     * 所有「一次送多张」的档位静默失效。
     */
    milestoneSeq: integer("milestoneSeq").notNull().default(0),
    /** 开奖记录 ID；非空即已消耗。 */
    usedDrawId: text("usedDrawId"),
    /** 活动轮次标识（活动 startAt 字符串，如 "2026-10-09 00:00"）；历史数据为 null。 */
    activityKey: text("activityKey"),
    /** 是否过期作废（活动结束且配置允许过期时标记为 1）；0=有效，1=已过期。 */
    expired: integer("expired").notNull().default(0),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
  },
  (table) => [
    // 同一用户同一活动轮次的同一档位只发一次：重复领取时第 0 张必然撞索引，整笔赠券因此被挡下。
    // 包含 activityKey，确保不同活动轮次可以各自领一次。
    // SQLite 的唯一索引把 NULL 视为互不相等，所以买券 / 抽中赠券的行（milestoneDraws 为 NULL）不受影响。
    unique("uq_lottery_ticket_milestone").on(table.userId, table.milestoneDraws, table.milestoneSeq, table.activityKey),
  ],
);

/** 限时活动·逐次开奖记录，兼作用户侧明细与累抽次数来源。 */
export const lotteryDraws = sqliteTable(
  "lottery_draw",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 一次点击（单抽或 10 连）共用一个批次号。 */
    batchId: text("batchId").notNull(),
    /** 批次内序号，从 1 开始。 */
    seq: integer("seq").notNull(),
    /** inner=内圈固定加减 / outer=外圈倍数。 */
    ring: text("ring").$type<"inner" | "outer">().notNull(),
    /** 奖品文案，如 `+50 cr` / `×2`。 */
    label: text("label").notNull(),
    /** 外圈倍数（负数表示倒扣）；内圈为 null。 */
    multiplier: real("multiplier"),
    /** 本次结算的 cr 变动，可负。 */
    deltaCredits: real("deltaCredits").notNull(),
    /** 本次倍数结算用的基数（cr）：单券价或批次总花费，见配置 multiplierBase。 */
    baseCredits: real("baseCredits").notNull().default(0),
    /** 本次抽中的抽奖券张数（外圈赠券档）；0 = 不发券。券不进 cr 账本，所以不写流水。 */
    grantTickets: integer("grantTickets").notNull().default(0),
    /** 消耗掉的券。 */
    ticketId: text("ticketId").references(() => lotteryTickets.id, {
      onDelete: "set null",
    }),
    /** 活动轮次标识（活动 startAt 字符串）；历史数据为 null。 */
    activityKey: text("activityKey"),
    /**
     * 2026-10-17 新增：只有「今日免费抽」那一行写值（北京日期，如 "2026-10-17"），花钱抽的写 null。
     * 配合下面的唯一索引，让并发/连点免费抽在库层被挡下——`hasUsedFreeDrawToday` 是先读后写，
     * 两个请求同时进来时都会读到「今天还没抽」，只靠它一天能抽好几次。
     */
    freeDrawDate: text("freeDrawDate"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
  },
  (table) => [
    unique().on(table.batchId, table.seq),
    // SQLite 的唯一索引认为 NULL 互不相等，所以付费抽（freeDrawDate 为 null）不受影响。
    unique("uq_lottery_draw_free_draw").on(table.userId, table.freeDrawDate),
  ],
);

/**
 * 2026-10-29 新增：抽奖累计统计行，一行 = 一个用户 × 一个口径。
 *
 * 「不限时间」的 COUNT/SUM 加索引也救不了：`/lottery`、看板、管理端「全部」每次加载
 * 都要把 `lottery_draw` / `lottery_ticket` 整表扫一遍，D1 免费层的每日读取额度很快见底。
 * 改成开奖、买券时把增量写进这一行（`lib/lottery/stats.ts` 定义口径），读侧只取一行；
 * 时间窗口径（管理端今日/近 7 日/近 30 日）仍然回到明细表聚合。
 *
 * scope：`all` = 全量累计；其余为活动轮次 startAt 字符串，与 `lottery_draw.activityKey` 同口径。
 * 券侧计数（bought / unused / gift / prize）只维护 `all` 口径，活动轮次行里恒为 0。
 */
export const lotteryUserStats = sqliteTable(
  "lottery_user_stats",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    draws: integer("draws").notNull().default(0),
    outerHits: integer("outerHits").notNull().default(0),
    paidOut: real("paidOut").notNull().default(0),
    clawedBack: real("clawedBack").notNull().default(0),
    ticketFace: real("ticketFace").notNull().default(0),
    /** 该口径内最后一次开奖时间；回滚时按明细重算。 */
    lastDrawAt: integer("lastDrawAt", { mode: "timestamp_ms" }),
    boughtTickets: integer("boughtTickets").notNull().default(0),
    boughtCredits: real("boughtCredits").notNull().default(0),
    unusedTickets: integer("unusedTickets").notNull().default(0),
    unusedCredits: real("unusedCredits").notNull().default(0),
    giftTickets: integer("giftTickets").notNull().default(0),
    prizeTickets: integer("prizeTickets").notNull().default(0),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).$defaultFn(now),
  },
  (table) => [primaryKey({ columns: [table.userId, table.scope] })],
);

/**
 * 限时活动·雷电行动：一次出击一行。
 *
 * 客户端是游戏权威，服务端只认「这一局确实开了这么久、关卡顺序对」再发奖；
 * 每笔 CR 花费（出击装备、复活）都在这张表和 `topup` 流水里各留一份。
 */
export const raidenRuns = sqliteTable(
  "raiden_run",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 活动轮次标识（活动 startAt 字符串）。 */
    activityKey: text("activityKey"),
    /** active=进行中 / cleared=通关 / failed=阵亡结束 / abandoned=主动放弃。 */
    status: text("status").$type<"active" | "cleared" | "failed" | "abandoned">().notNull().default("active"),
    /** 出击装备快照（JSON，审计用）。 */
    loadout: text("loadout"),
    /** 起始火力等级（1-3）。 */
    power: integer("power").notNull().default(1),
    /** 起始炸弹数。 */
    bombs: integer("bombs").notNull().default(3),
    /** 起始生命数。 */
    lives: integer("lives").notNull().default(3),
    /** 本局付费复活次数。 */
    revives: integer("revives").notNull().default(0),
    /** 本局装备 + 复活共花掉的 cr。 */
    creditsSpent: real("creditsSpent").notNull().default(0),
    /** 已结算通过的最高关数（0 = 尚未通关）。 */
    stage: integer("stage").notNull().default(0),
    /** 已结算关卡分数之和。 */
    score: integer("score").notNull().default(0),
    startedAt: integer("startedAt", { mode: "timestamp_ms" }).notNull(),
    /** 上一关结算时间；下一关的最短时长校验从这里起算。 */
    lastSettleAt: integer("lastSettleAt", { mode: "timestamp_ms" }).notNull(),
    endedAt: integer("endedAt", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("idx_raiden_run_user").on(table.userId, table.activityKey, table.startedAt),
    index("idx_raiden_run_board").on(table.activityKey, table.score),
  ],
);

export type RaidenRun = typeof raidenRuns.$inferSelect;

/**
 * 每一关的结算流水：`(runId, stageNo)` 唯一，重复提交不会重复发奖。
 * 重复通关奖励的每日封顶按这张表的 `createdAt` 汇总。
 */
export const raidenClears = sqliteTable(
  "raiden_clear",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    runId: text("runId").notNull(),
    activityKey: text("activityKey").notNull(),
    stageNo: integer("stageNo").notNull(),
    score: integer("score").notNull().default(0),
    /** first=本活动首次通关该关 / repeat=重复通关。 */
    kind: text("kind").$type<"first" | "repeat">().notNull(),
    /** 本次实发 cr（重复奖励可能被日封顶裁成 0）。 */
    rewardCredits: real("rewardCredits").notNull().default(0),
    durationMs: integer("durationMs").notNull().default(0),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).$defaultFn(now),
  },
  (table) => [
    unique("uq_raiden_clear_run_stage").on(table.runId, table.stageNo),
    index("idx_raiden_clear_user").on(table.userId, table.activityKey, table.createdAt),
    index("idx_raiden_clear_stage").on(table.activityKey, table.stageNo),
  ],
);

export type RaidenClear = typeof raidenClears.$inferSelect;

/**
 * 每用户 × 活动轮次 × 关卡的累计进度。第一次 INSERT 命中即为首通：
 * 并发两个请求同时通关同一关时，只有一个能插进去，另一个按重复通关处理。
 */
export const raidenProgress = sqliteTable(
  "raiden_progress",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityKey: text("activityKey").notNull(),
    stageNo: integer("stageNo").notNull(),
    firstClearedAt: integer("firstClearedAt", { mode: "timestamp_ms" }).notNull(),
    clears: integer("clears").notNull().default(1),
    bestScore: integer("bestScore").notNull().default(0),
    /** 该关最快通关用时（毫秒）；用于展示个人最佳。 */
    bestDurationMs: integer("bestDurationMs"),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.activityKey, table.stageNo] }),
    index("idx_raiden_progress_activity").on(table.activityKey, table.stageNo),
  ],
);

export type RaidenProgressRow = typeof raidenProgress.$inferSelect;

/**
 * 2026-10-17 新增：跨实例的固定窗口限流计数。
 *
 * 原先 `lib/rate-limit.ts` 用的是进程内 Map，Vercel 每个实例各有一份，形同虚设。
 * 一行一个窗口桶，计数靠一条 UPSERT 完成（见 `lib/rate-limit.ts`），不依赖事务。
 */
export const rateLimitBuckets = sqliteTable("rate_limit_bucket", {
  /** `scope:subject`，如 `lottery-draw:uuid`。 */
  bucketKey: text("bucketKey").primaryKey(),
  /** 窗口起点（按 windowMs 对齐的毫秒时间戳）；跨过新窗口时计数重置。 */
  windowStart: integer("windowStart").notNull(),
  /** 当前窗口内已通过的请求数。 */
  count: integer("count").notNull(),
  /** 该桶的窗口上限（随请求带上，改配置不用清表）。 */
  limitValue: integer("limitValue").notNull(),
  /** 桶的回收时间（窗口结束 + 一段宽限），过期由偶发的清理语句删掉。 */
  expiresAt: integer("expiresAt").notNull(),
});
