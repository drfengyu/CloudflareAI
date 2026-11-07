/**
 * 充值弹窗的展示换算：与 `lib/payment/order.ts` 结算口径保持一致，
 * 金额 × 汇率后向下取整到分。
 */
export function rechargeCredits(amount: number, rate: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || amount <= 0 || rate <= 0) return 0;
  return Math.floor(amount * rate * 100) / 100;
}

/** 左上角汇率角标：1 元 / 1 积分能换多少 cr，按百分比展示（7.1 → 710）。 */
export function rechargeRatePercent(rate: number): number {
  return Number.isFinite(rate) && rate > 0 ? Math.round(rate * 100) : 0;
}

/** 与 `validateRechargeAmount` 同口径的前端校验；通过时返回 null。 */
export function rechargeAmountError(
  amount: number,
  min: number,
  max: number,
  unit: string,
): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "请输入充值金额";
  if (amount < min) return `单笔最低 ${min} ${unit}`;
  if (amount > max) return `单笔最高 ${max} ${unit}`;
  return null;
}
