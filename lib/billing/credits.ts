/**
 * Billing constants & helpers for credit-based accounting.
 *
 * 历史：原本写死 `1 credit = $1 USD` (1:1)。改造后由管理员在 /admin/settings
 * 通过 `option.creditsPerUsd` 配置（默认仍为 1，向后兼容）。
 *
 * Credits 仍是计费/扣减的内部单位；USD 仅用于展示与导入/导出换算。
 * Credits 支持小数（DB 中是 REAL）。
 */

import { db } from "@/lib/db/d1-http";
import { options } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** 兼容旧代码：固定为 1。新代码应使用 `getCreditsPerUsd()`。 */
export const CREDITS_PER_USD = 1;

/** option 表中存放汇率的 key。 */
export const CREDITS_PER_USD_OPTION_KEY = "creditsPerUsd";

/** 默认汇率，DB 未配置时使用。 */
export const DEFAULT_CREDITS_PER_USD = 1;

let ratioCache: { value: number; cachedAt: number } | null = null;
const RATIO_CACHE_TTL = 60_000; // 1 分钟

/**
 * 从 option 表读取「1 USD = ? credits」的汇率。带 60s 缓存。
 * 保存设置时调用 `invalidateCreditsPerUsdCache()` 立即生效。
 */
export async function getCreditsPerUsd(): Promise<number> {
  const now = Date.now();
  if (ratioCache && now - ratioCache.cachedAt < RATIO_CACHE_TTL) {
    return ratioCache.value;
  }

  try {
    const rows = await db
      .select()
      .from(options)
      .where(eq(options.key, CREDITS_PER_USD_OPTION_KEY))
      .limit(1);
    const raw = rows[0]?.value;
    const parsed = raw != null ? parseFloat(raw) : NaN;
    const value =
      Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CREDITS_PER_USD;
    ratioCache = { value, cachedAt: now };
    return value;
  } catch (err) {
    console.error("[getCreditsPerUsd] fallback to default:", err);
    ratioCache = { value: DEFAULT_CREDITS_PER_USD, cachedAt: now };
    return DEFAULT_CREDITS_PER_USD;
  }
}

/** 设置保存后调用，使下一次 `getCreditsPerUsd()` 命中最新值。 */
export function invalidateCreditsPerUsdCache(): void {
  ratioCache = null;
}

/**
 * USD → credits。
 * @param usd USD 金额
 * @param ratio 1 USD = ? credits，传入运行时汇率；省略则用旧常量（向后兼容）
 */
export function usdToCredits(
  usd: number,
  ratio: number = CREDITS_PER_USD,
): number {
  return usd * ratio;
}

/**
 * credits → USD。
 * @param credits credits 数量
 * @param ratio 1 USD = ? credits，传入运行时汇率；省略则用旧常量（向后兼容）
 */
export function creditsToUsd(
  credits: number,
  ratio: number = CREDITS_PER_USD,
): number {
  return credits / ratio;
}

/**
 * Format credits for display (适应小额和大额).
 * @example formatCredits(1234.56) → "1,234.56"
 * @example formatCredits(0.001) → "0.001"
 * @example formatCredits(0.0001) → "0.0001"
 */
export function formatCredits(credits: number): string {
  if (credits === 0) return "0";
  // 小于 0.01 显示更多小数位
  if (Math.abs(credits) < 0.01) return credits.toFixed(6);
  // 小于 1 显示 4 位小数
  if (Math.abs(credits) < 1) return credits.toFixed(4);
  // 大于等于 1 显示 2 位小数
  return credits.toFixed(2);
}

/**
 * 服务端常用：把 credits 直接格式化成 "$X.XX" 字符串，自动读取汇率。
 * 客户端组件应改为接收 `ratio` prop 后用 `creditsToUsd(credits, ratio).toFixed(n)`。
 */
export async function formatUsdFromCredits(
  credits: number,
  digits = 2,
): Promise<string> {
  const ratio = await getCreditsPerUsd();
  return `$${creditsToUsd(credits, ratio).toFixed(digits)}`;
}
