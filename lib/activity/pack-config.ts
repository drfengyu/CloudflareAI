import { getSetting } from "@/lib/settings";

/**
 * 珍宝礼包配置（`option` 表的 `coupon_pack_config`，三个活动共用）。
 *
 * 档位可增删，每档独立设置：
 * - 名称与实付价（历史购买记录保存价格快照，改价不影响旧记录）；
 * - 倍率：券面 / 实付，按百分比存（200 = 200%）；
 * - 每日限购 / 累计限购：0 表示不限，按「用户 + 档位」统计（北京自然日）；
 * - 赠送内容：每份赠 N 张当期活动券 + M tcr 临时余额（有效期天数）。
 *
 * 档位 key 一旦生成就不再变化：购买记录按它统计限购，删档重建会从零计数。
 */

export const COUPON_PACK_CONFIG_KEY = "coupon_pack_config";
export const MAX_COUPON_PACKS = 6;
export const MAX_PACK_NAME = 24;

export interface CouponPackSetting {
  /** 档位稳定标识，购买记录按它统计限购。 */
  key: string;
  name: string;
  /** 实付 cr。 */
  priceCredits: number;
  /** 倍率百分比：200 = 200%。 */
  ratioPercent: number;
  /** 每北京自然日限购份数；0 = 不限。 */
  dailyLimit: number;
  /** 累计限购份数；0 = 不限。 */
  totalLimit: number;
  /** 每份赠送的活动券张数。 */
  bonusTickets: number;
  /** 每份赠送的临时余额 tcr。 */
  tempCredits: number;
  /** 赠送临时余额的有效期（天）。 */
  tempValidDays: number;
}

export interface CouponPackConfig {
  packs: CouponPackSetting[];
}

export const DEFAULT_COUPON_PACK_CONFIG: CouponPackConfig = {
  packs: [
    {
      key: "small",
      name: "小份珍宝",
      priceCredits: 10,
      ratioPercent: 200,
      dailyLimit: 0,
      totalLimit: 0,
      bonusTickets: 1,
      tempCredits: 0,
      tempValidDays: 30,
    },
    {
      key: "medium",
      name: "中份珍宝",
      priceCredits: 50,
      ratioPercent: 500,
      dailyLimit: 2,
      totalLimit: 20,
      bonusTickets: 1,
      tempCredits: 0,
      tempValidDays: 30,
    },
    {
      key: "large",
      name: "大份珍宝",
      priceCredits: 100,
      ratioPercent: 1000,
      dailyLimit: 1,
      totalLimit: 10,
      bonusTickets: 1,
      tempCredits: 0,
      tempValidDays: 30,
    },
  ],
};

const MAX_RATIO_PERCENT = 100_000;
const MAX_PRICE = 1_000_000;
const MAX_LIMIT = 1_000_000;
const MAX_TICKETS = 1_000;
const MAX_VALID_DAYS = 3650;
const DEFAULT_VALID_DAYS = 30;
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const LEGACY_KEYS = ["small", "medium", "large"] as const;

const round2 = (value: number): number => Math.round(value * 100) / 100;

function money(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(MAX_PRICE, Math.max(0.01, round2(n)));
}

function ratio(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(MAX_RATIO_PERCENT, Math.max(0.01, round2(n)));
}

function limit(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(MAX_LIMIT, Math.trunc(n));
}

function tickets(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(MAX_TICKETS, Math.trunc(n));
}

/** 赠送的临时余额可为 0，且支持小数 cr。 */
function bonusCredits(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(MAX_PRICE, round2(n));
}

function validDays(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(MAX_VALID_DAYS, Math.trunc(n));
}

function packName(raw: unknown, fallback: string): string {
  const text = typeof raw === "string" ? raw.trim().slice(0, MAX_PACK_NAME) : "";
  return text || fallback;
}

function cloneDefaults(): CouponPackConfig {
  return { packs: DEFAULT_COUPON_PACK_CONFIG.packs.map((pack) => ({ ...pack })) };
}

/** 旧版配置是 `{ small: {...}, medium: {...}, large: {...} }`，按固定档位身份升级成数组。 */
function legacyPacks(source: Record<string, unknown>): unknown[] {
  const items: unknown[] = [];
  for (const legacyKey of LEGACY_KEYS) {
    const item = source[legacyKey];
    const setting =
      item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const defaults = DEFAULT_COUPON_PACK_CONFIG.packs.find((pack) => pack.key === legacyKey);
    if (!defaults) continue;
    items.push({
      ...setting,
      key: legacyKey,
      name: defaults.name,
      priceCredits: defaults.priceCredits,
      bonusTickets: defaults.bonusTickets,
      tempCredits: 0,
      tempValidDays: DEFAULT_VALID_DAYS,
    });
  }
  return items;
}

/** 缺键、脏值逐字段回默认；空列表回默认三档，商品页永远有可展示的礼包。 */
export function sanitizeCouponPackConfig(raw: unknown): CouponPackConfig {
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const items = Array.isArray(source.packs)
    ? source.packs
    : Array.isArray(raw)
      ? raw
      : legacyPacks(source);
  if (!items || items.length === 0) return cloneDefaults();

  const packs: CouponPackSetting[] = [];
  const seenKeys = new Set<string>();
  for (let index = 0; index < items.length && packs.length < MAX_COUPON_PACKS; index += 1) {
    const item = items[index];
    const record =
      item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const fallback = DEFAULT_COUPON_PACK_CONFIG.packs[index] ?? DEFAULT_COUPON_PACK_CONFIG.packs[0];

    const rawKey = typeof record.key === "string" ? record.key.trim() : "";
    let key = KEY_PATTERN.test(rawKey) ? rawKey : `pack-${index + 1}`;
    let suffix = index + 1;
    while (seenKeys.has(key)) key = `${rawKey || "pack"}-${suffix++}`;
    seenKeys.add(key);

    packs.push({
      key,
      name: packName(record.name, fallback.name),
      priceCredits: money(record.priceCredits, fallback.priceCredits),
      ratioPercent: ratio(record.ratioPercent, fallback.ratioPercent),
      dailyLimit: limit(record.dailyLimit, fallback.dailyLimit),
      totalLimit: limit(record.totalLimit, fallback.totalLimit),
      bonusTickets: tickets(record.bonusTickets, fallback.bonusTickets),
      tempCredits: bonusCredits(record.tempCredits, fallback.tempCredits),
      tempValidDays: validDays(record.tempValidDays, fallback.tempValidDays),
    });
  }
  return packs.length > 0 ? { packs } : cloneDefaults();
}

export async function getCouponPackConfig(): Promise<CouponPackConfig> {
  const raw = await getSetting<unknown>(COUPON_PACK_CONFIG_KEY, null);
  return sanitizeCouponPackConfig(raw);
}
