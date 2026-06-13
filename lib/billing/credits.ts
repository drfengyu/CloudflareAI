/**
 * Billing constants for credit-based accounting.
 * 1 credit = $0.01 USD (100 credits = $1).
 */

export const CREDITS_PER_USD = 100;

/**
 * Convert USD to credits (integer).
 * @example usdToCredits(0.01) → 5000
 */
export function usdToCredits(usd: number): number {
  return Math.floor(usd * CREDITS_PER_USD);
}

/**
 * Convert credits to USD.
 * @example creditsToUsd(5000) → 0.01
 */
export function creditsToUsd(credits: number): number {
  return credits / CREDITS_PER_USD;
}
