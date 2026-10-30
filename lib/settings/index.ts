import { db } from "@/lib/db/d1-http";
import { options } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

/** 值缺失/为空时给默认值，否则按默认值的类型解释库里存的那一列文本。 */
function coerceSettingValue<T>(raw: string | null | undefined, defaultValue: T): T {
  if (raw === undefined || raw === null) return defaultValue;
  if (typeof defaultValue === "boolean") return (raw === "true" || raw === "1") as T;
  if (typeof defaultValue === "number") return Number(raw) as T;
  if (typeof defaultValue === "object") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  }
  return raw as T;
}

/**
 * 一次 `IN` 查询读多个键（默认值只能是标量；要读 JSON 配置走 `getSetting`）。
 *
 * 2026-10-17 性能：原先每个键一条 `SELECT ... WHERE key = ?`，钱包页读 `ldpay_*` 就要并发
 * 7 条打同一张 36 行的 `option` 表，最慢的一条（D1 REST 偶发 2 秒尖峰）决定整页尾巴。
 * 解析口径与 `getSetting` 共用 `coerceSettingValue`，不改任何语义。
 */
export async function getSettingsMap<
  D extends Record<string, string | number | boolean>,
>(defaults: D): Promise<D> {
  const keys = Object.keys(defaults);
  let values = new Map<string, string | null>();
  try {
    const rows = await db
      .select({ key: options.key, value: options.value })
      .from(options)
      .where(inArray(options.key, keys));
    values = new Map(rows.map((row) => [row.key, row.value]));
  } catch (err) {
    console.error(`[getSettingsMap] Failed to get ${keys.join(", ")}:`, err);
  }
  const out: Record<string, unknown> = { ...defaults };
  for (const key of keys) {
    out[key] = coerceSettingValue(values.get(key), defaults[key]);
  }
  return out as D;
}

/**
 * 获取系统设置值
 * @param key 设置键名
 * @param defaultValue 默认值
 */
export async function getSetting<T = string>(key: string, defaultValue: T): Promise<T> {
  try {
    const rows = await db
      .select({ value: options.value })
      .from(options)
      .where(eq(options.key, key))
      .limit(1);

    return coerceSettingValue(rows[0]?.value, defaultValue);
  } catch (err) {
    console.error(`[getSetting] Failed to get ${key}:`, err);
    return defaultValue;
  }
}

/**
 * 设置系统配置值
 * @param key 设置键名
 * @param value 设置值
 */
export async function setSetting(key: string, value: string | number | boolean | object): Promise<void> {
  const stringValue = typeof value === "object" ? JSON.stringify(value) : String(value);

  await db
    .insert(options)
    .values({ key, value: stringValue })
    .onConflictDoUpdate({
      target: options.key,
      set: { value: stringValue },
    });
}

/**
 * 获取认证渠道配置
 * 2026-10-17 性能：3 个键合成一次 IN 查询（原先 3 条并发 SELECT）。
 */
export async function getAuthChannels() {
  const cfg = await getSettingsMap({
    auth_email_enabled: true,
    auth_github_enabled: true,
    auth_linuxdo_enabled: true,
  });

  return {
    email: cfg.auth_email_enabled,
    github: cfg.auth_github_enabled,
    linuxdo: cfg.auth_linuxdo_enabled,
  };
}

/** 邀请返利配置：奖励直接进永久余额，金额在注册当时锁定到 invite_record。 */
export async function getInviteSettings() {
  const cfg = await getSettingsMap({
    invite_enabled: true,
    invite_reward_inviter: 300,
    invite_reward_invitee: 200,
  });

  return {
    enabled: cfg.invite_enabled,
    inviterReward: Math.max(0, cfg.invite_reward_inviter),
    inviteeReward: Math.max(0, cfg.invite_reward_invitee),
  };
}

/** 取值兜底：管理员手填或历史脏值可能是 NaN/负数，读侧也要保证算得出可用数。 */
function num(raw: number, fallback: number, min: number, max: number): number {
  return Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : fallback;
}

/**
 * 消费返利配置。默认**关闭**：部署本身不发钱，开与不开、比例多少都由后台决定。
 *
 * 口径是「按北京自然日结算、用户手动领取」：返利只算已结束的日子（今天不算），
 * `backfillDays` 限制最多能往前补领几天，避免攒很久后一次性领走大额。
 */
export async function getCashbackSettings() {
  const cfg = await getSettingsMap({
    cashback_enabled: false,
    cashback_rate: 0.1,
    cashback_min_credits: 20,
    cashback_cap: 200,
    cashback_valid_days: 7,
    cashback_backfill_days: 3,
    cashback_leaderboard_days: 7,
    cashback_leaderboard_size: 20,
  });

  return {
    enabled: cfg.cashback_enabled,
    rate: num(cfg.cashback_rate, 0.1, 0, 1),
    minCredits: num(cfg.cashback_min_credits, 20, 0, 1_000_000),
    cap: num(cfg.cashback_cap, 200, 0, 1_000_000),
    validDays: num(cfg.cashback_valid_days, 7, 1, 365),
    backfillDays: num(cfg.cashback_backfill_days, 3, 1, 31),
    leaderboardDays: num(cfg.cashback_leaderboard_days, 7, 1, 90),
    leaderboardSize: num(cfg.cashback_leaderboard_size, 20, 1, 50),
  };
}

/**
 * 任务成就配置。默认**关闭**：任务清单与默认额度写在代码里（`lib/tasks/tasks.ts`），
 * 后台只决定开不开、临时余额给几天、以及按任务 key 覆盖额度——完成判定永远读业务表现场数据，
 * 所以这里没有任何需要跟数据同步的状态。
 */
export async function getTaskSettings() {
  const cfg = await getSettingsMap({
    tasks_enabled: false,
    tasks_valid_days: 30,
    task_reward_overrides: "{}",
  });

  let rewardOverrides: Record<string, number> = {};
  try {
    const parsed: unknown = JSON.parse(cfg.task_reward_overrides);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [key, raw] of Object.entries(parsed)) {
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0 && n <= 100_000) {
          rewardOverrides[key] = Math.round(n * 100) / 100;
        }
      }
    }
  } catch {
    rewardOverrides = {};
  }

  return {
    enabled: cfg.tasks_enabled,
    validDays: num(cfg.tasks_valid_days, 30, 1, 365),
    rewardOverrides,
  };
}
