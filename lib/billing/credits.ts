/**
 * Billing constants for credit-based accounting.
 * 1 credit = $1 USD (1:1 conversion).
 */

export const CREDITS_PER_USD = 1;

/**
 * Convert USD to credits (integer).
 * @example usdToCredits(10.5) → 10
 */
export function usdToCredits(usd: number): number {
  return Math.floor(usd * CREDITS_PER_USD);
}

/**
 * Convert credits to USD.
 * @example creditsToUsd(10) → 10.0
 */
export function creditsToUsd(credits: number): number {
  return credits / CREDITS_PER_USD;
}
