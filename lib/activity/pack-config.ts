import { getSetting } from "@/lib/settings";

/**
 * 珍宝礼包配置（`option` 表的 `coupon_pack_config`，三个活动共用）。
 *
 * 每个礼包可调：
 * - 倍率：券面 / 实付，按百分比存（200 = 200%）；
 * - 每日限购 / 累计限购：0 表示不限，非 0 时按「用户 + 礼包」统计（北京自然日）。
 */

export type CouponPackKey = "small" | "medium" | "large";

export const COUPON_PACK_CONFIG_KEY = "coupon_pack_config";

/** 礼包固定身份：名称与实付价不进配置，避免改价影响历史购买记录的口径。 */
export const COUPON_PACK_META: Record<CouponPackKey, { name: string; priceCredits: number }> = {
  small: { name: "小份珍宝", priceCredits: 10 },
  medium: { name: "中份珍宝", priceCredits: 50 },
  large: { name: "大份珍宝", priceCredits: 100 },
};

export interface CouponPackSetting {
  /** 倍率百分比：200 = 200%。 */
  ratioPercent: number;
  /** 每北京自然日限购份数；0 = 不限。 */
  dailyLimit: number;
  /** 累计限购份数；0 = 不限。 */
  totalLimit: number;
}

export type CouponPackConfig = Record<CouponPackKey, CouponPackSetting>;

export const DEFAULT_COUPON_PACK_CONFIG: CouponPackConfig = {
  small: { ratioPercent: 200, dailyLimit: 0, totalLimit: 0 },
  medium: { ratioPercent: 500, dailyLimit: 2, totalLimit: 20 },
  large: { ratioPercent: 1000, dailyLimit: 1, totalLimit: 10 },
};

const MAX_RATIO_PERCENT = 100_000;
const MAX_LIMIT = 1_000_000;

const round2 = (value: number): number => Math.round(value * 100) / 100;

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

/** 缺键、脏值逐字段回默认，不让礼包价格算成 NaN 或负数。 */
export function sanitizeCouponPackConfig(raw: unknown): CouponPackConfig {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const build = (key: CouponPackKey): CouponPackSetting => {
    const defaults = DEFAULT_COUPON_PACK_CONFIG[key];
    const item = source[key];
    const setting =
      item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      ratioPercent: ratio(setting.ratioPercent, defaults.ratioPercent),
      dailyLimit: limit(setting.dailyLimit, defaults.dailyLimit),
      totalLimit: limit(setting.totalLimit, defaults.totalLimit),
    };
  };
  return { small: build("small"), medium: build("medium"), large: build("large") };
}

export async function getCouponPackConfig(): Promise<CouponPackConfig> {
  const raw = await getSetting<unknown>(COUPON_PACK_CONFIG_KEY, null);
  return sanitizeCouponPackConfig(raw);
}
