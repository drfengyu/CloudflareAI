/**
 * Billing constants for credit-based accounting.
 * 1 credit = $1 USD (1:1 conversion).
 * Credits support fractional values (real/float type in DB).
 */

export const CREDITS_PER_USD = 1;

/**
 * Convert USD to credits (supports fractional).
 * @example usdToCredits(10.5) → 10.5
 * @example usdToCredits(0.001) → 0.001
 */
export function usdToCredits(usd: number): number {
  return usd * CREDITS_PER_USD;
}

/**
 * Convert credits to USD.
 * @example creditsToUsd(10) → 10.0
 */
export function creditsToUsd(credits: number): number {
  return credits / CREDITS_PER_USD;
}

/**
 * Format credits for display (4 decimal places for small values, 2 for large).
 */
export function formatCredits(credits: number): string {
  if (credits === 0) return "0";
  if (Math.abs(credits) < 0.01) return credits.toFixed(6);
  if (Math.abs(credits) < 1) return credits.toFixed(4);
  return credits.toFixed(2);
}
