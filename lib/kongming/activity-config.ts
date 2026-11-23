import { parseCnWallClock } from "@/lib/date";

/**
 * 限时活动·诸葛孔明传的配置。
 *
 * 活动券按 `couponUnitCredits` 用余额兑换；进入游戏后可在活动面板把券
 * 换成存档里的「金」。金只存在浏览器存档（与桌面版单机存档一致），
 * 服务端只负责扣券，兑换比例由后台控制。
 */

export const KONGMING_ACTIVITY_CONFIG_KEY = "kongming_config";

export interface KongmingActivityConfig {
  enabled: boolean;
  startAt: string;
  endAt: string;
  /** 1 张活动券 = 多少 cr（券面单价，也用于礼包折算）。 */
  couponUnitCredits: number;
  /** 1 张活动券可换多少游戏内「金」。 */
  goldPerCoupon: number;
  /** 单次最多兑换几张，防手滑输入过大。 */
  maxCouponsPerExchange: number;
}

export const DEFAULT_KONGMING_ACTIVITY_CONFIG: KongmingActivityConfig = {
  // 新活动默认开启，后台可随时关停；改开始时间等于开新一轮（券按轮次隔离）。
  enabled: true,
  startAt: "2026-11-23 00:00",
  endAt: "2027-01-31 23:59",
  couponUnitCredits: 2,
  goldPerCoupon: 100,
  maxCouponsPerExchange: 200,
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

function positiveNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function sanitizeKongmingActivityConfig(raw: unknown): KongmingActivityConfig {
  const d = DEFAULT_KONGMING_ACTIVITY_CONFIG;
  if (!raw || typeof raw !== "object") return d;
  const it = raw as Partial<KongmingActivityConfig>;
  return {
    enabled: it.enabled === true,
    startAt: typeof it.startAt === "string" ? it.startAt.trim() : "",
    endAt: typeof it.endAt === "string" ? it.endAt.trim() : "",
    couponUnitCredits: Math.min(
      1_000_000,
      round2(positiveNumber(it.couponUnitCredits, d.couponUnitCredits)),
    ),
    goldPerCoupon: boundedInteger(it.goldPerCoupon, d.goldPerCoupon, 1, 1_000_000),
    maxCouponsPerExchange: boundedInteger(
      it.maxCouponsPerExchange,
      d.maxCouponsPerExchange,
      1,
      10_000,
    ),
  };
}

export interface KongmingActivityWindow {
  status: "disabled" | "pending" | "active" | "ended";
  startMs: number | null;
  endMs: number | null;
}

export function kongmingActivityWindow(
  config: KongmingActivityConfig,
  now = Date.now(),
): KongmingActivityWindow {
  if (!config.enabled) return { status: "disabled", startMs: null, endMs: null };
  const startMs = parseCnWallClock(config.startAt);
  const endMs = parseCnWallClock(config.endAt);
  if (startMs === null || endMs === null || endMs <= startMs) {
    return { status: "pending", startMs, endMs };
  }
  if (now < startMs) return { status: "pending", startMs, endMs };
  if (now >= endMs) return { status: "ended", startMs, endMs };
  return { status: "active", startMs, endMs };
}

export function kongmingActivityKey(config: KongmingActivityConfig): string | null {
  if (!config.enabled || !config.startAt.trim()) return null;
  return config.startAt.trim();
}
