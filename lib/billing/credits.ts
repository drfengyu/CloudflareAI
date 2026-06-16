/**
 * Billing constants for credit-based accounting.
 * 1 credit = $1 USD (1:1 conversion)
 * Credits support fractional values (REAL type in DB).
 */

export const CREDITS_PER_USD = 1;

/**
 * Convert USD to credits (supports fractional).
 * @example usdToCredits(1) → 1
 * @example usdToCredits(0.001) → 0.001
 * @example usdToCredits(10.5) → 10.5
 */
export function usdToCredits(usd: number): number {
  return usd * CREDITS_PER_USD;
}

/**
 * Convert credits to USD.
 * @example creditsToUsd(1) → 1.0
 * @example creditsToUsd(0.05) → 0.05
 */
export function creditsToUsd(credits: number): number {
  return credits / CREDITS_PER_USD;
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
