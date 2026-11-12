/**
 * 货币单位：
 * - cr  = 充值、一次性奖励与返利到账的余额，不过期；
 * - tcr = 签到、活动奖励等赠送额度，带有效期，到期作废。
 *
 * 两者 1:1 可花，消费时先扣 tcr、再扣 cr。活动券按整张发放与展示，
 * 兑换与礼包实付按 cr；内部以 cr 券面（1 张 = couponUnitCredits cr）记账供玩法抵扣。
 */

export const PERMANENT_UNIT = "cr";
export const TEMPORARY_UNIT = "tcr";

/** 与旧版 `formatCredits` 相同的小数规则；独立放这里避免把 DB 依赖带进客户端。 */
export function formatAmount(value: number): string {
  if (value === 0) return "0";
  if (Math.abs(value) < 0.01) return value.toFixed(6);
  if (Math.abs(value) < 1) return value.toFixed(4);
  return value.toFixed(2);
}

/** 活动券张数：一律整数，不带单位。 */
export function formatTickets(value: number): string {
  return String(Math.round(value));
}

export function formatPermanent(value: number): string {
  return `${formatAmount(value)} ${PERMANENT_UNIT}`;
}

export function formatTemporary(value: number): string {
  return `${formatAmount(value)} ${TEMPORARY_UNIT}`;
}

/** 两本账并列展示：临时为 0 时只留 cr，避免“X cr + 0 tcr”这种噪声。 */
export function formatCombined(permanent: number, temporary: number): string {
  if (temporary <= 0) return formatPermanent(permanent);
  return `${formatPermanent(permanent)} + ${formatTemporary(temporary)}`;
}

/** v0.32 发放记录里存过「X cr 永久货币 / X cr 临时货币」，渲染前统一成单位写法。 */
export function normalizeCurrencyText(text: string | null | undefined): string | null {
  if (!text) return null;
  return text
    .replace(/(\d+(?:\.\d+)?)\s*cr\s*临时货币/g, `$1 ${TEMPORARY_UNIT}`)
    .replace(/(\d+(?:\.\d+)?)\s*cr\s*永久货币/g, `$1 ${PERMANENT_UNIT}`)
    .replace(/临时货币/g, TEMPORARY_UNIT)
    .replace(/永久货币/g, PERMANENT_UNIT);
}
