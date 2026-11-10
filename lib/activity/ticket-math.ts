/**
 * 活动券的整张口径：内部仍以 cr 券面记账（1 张 = couponUnitCredits cr），
 * 但张数一律是整数——兑换、礼包、奖励与玩法扣费都不出现小数张。
 */

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function unitCreditsOf(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** 余额可用的整张数：不足一张的零头不算可用。 */
export function couponTickets(credits: number, unitCredits: number): number {
  const unit = unitCreditsOf(unitCredits);
  const value = Number(credits);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(round2(value / unit) + 1e-9);
}

/** 一次扣费相当于几张券；不足一张按一张计（配置应保证价格是整数倍）。 */
export function ticketsForCost(costCredits: number, unitCredits: number): number {
  const unit = unitCreditsOf(unitCredits);
  const value = Number(costCredits);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(1, Math.ceil(round2(value / unit) - 1e-9));
}

/** 整张券的券面金额。 */
export function creditsForTickets(tickets: number, unitCredits: number): number {
  const unit = unitCreditsOf(unitCredits);
  return round2(Math.max(0, Math.trunc(tickets)) * unit);
}

/** 把价格对齐到券单价的整数倍；脏配置读回来也保持整张口径。 */
export function snapCostToUnit(costCredits: number, unitCredits: number): number {
  const unit = unitCreditsOf(unitCredits);
  const value = Number(costCredits);
  if (!Number.isFinite(value) || value <= 0) return unit;
  return round2(Math.max(1, Math.round(value / unit)) * unit);
}
