/**
 * Billing constants for credit-based accounting.
 * Reference: new-api standard (500,000 credits = $1 USD)
 * - 1 credit = $0.000002
 * - 500,000 credits = $1.00
 * - Credits support fractional values (REAL type in DB)
 */

export const CREDITS_PER_USD = 500_000;

/**
 * Convert USD to credits (supports fractional).
 * @example usdToCredits(1) → 500000
 * @example usdToCredits(0.001) → 500
 * @example usdToCredits(0.000002) → 1
 */
export function usdToCredits(usd: number): number {
  return usd * CREDITS_PER_USD;
}

/**
 * Convert credits to USD.
 * @example creditsToUsd(500000) → 1.0
 * @example creditsToUsd(1000) → 0.002
 */
export function creditsToUsd(credits: number): number {
  return credits / CREDITS_PER_USD;
}

/**
 * Format credits for display (整数显示，无小数).
 * @example formatCredits(500000) → "500,000"
 * @example formatCredits(1234) → "1,234"
 * @example formatCredits(5) → "5"
 */
export function formatCredits(credits: number): string {
  if (credits === 0) return "0";
  // 四舍五入到整数
  const rounded = Math.round(credits);
  // 添加千位分隔符
  return rounded.toLocaleString("en-US");
}
