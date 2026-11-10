/**
 * 珍宝礼包到账口径：倍率只作用于实付金额，按该活动券的单价折成张数，
 * 再叠加配置的赠券张数。内部仍以 cr 券面（张数 × 单价）记账，供玩法 1:1 抵扣。
 */

const round2 = (value: number): number => Math.round(value * 100) / 100;

export interface PackGrantInput {
  priceCredits: number;
  ratioPercent: number;
  bonusTickets: number;
}

export function packGrant(input: PackGrantInput, unitCredits: number) {
  const unit = unitCredits > 0 ? unitCredits : 1;
  const ratioCredits = round2((input.priceCredits * input.ratioPercent) / 100);
  const bonusCredits = round2(input.bonusTickets * unit);
  const totalCredits = round2(ratioCredits + bonusCredits);
  return {
    /** 倍率折算的张数：实付 × 倍率 ÷ 该活动券单价。 */
    ratioTickets: round2(ratioCredits / unit),
    bonusTickets: input.bonusTickets,
    /** 到账合计张数，含赠券。 */
    totalTickets: round2(totalCredits / unit),
    totalCredits,
  };
}
