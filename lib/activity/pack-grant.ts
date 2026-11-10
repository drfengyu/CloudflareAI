import { unitCreditsOf } from "./ticket-math";

/**
 * 珍宝礼包到账口径：配置填「整数张数 + 倍率」，实付价按
 * 「张数 × 该活动券单价 × 100 ÷ 倍率」实时折算，再叠加配置的赠券张数。
 * 旧配置没有张数字段，按旧实付价与倍率折算成整张后同样走这套口径。
 */

const round2 = (value: number): number => Math.round(value * 100) / 100;

export interface PackGrantInput {
  /** 每份含的整数活动券张数；旧配置为 null。 */
  tickets: number | null;
  /** 旧版实付 cr，仅在 tickets 为 null 时参与折算。 */
  priceCredits: number;
  ratioPercent: number;
  bonusTickets: number;
}

/** 旧配置：实付 × 倍率 ÷ 单价，四舍五入到整张，至少 1 张。 */
function legacyTickets(priceCredits: number, ratioPercent: number, unitCredits: number): number {
  const face = round2((Math.max(0, priceCredits) * ratioPercent) / 100);
  return Math.max(1, Math.round(face / unitCredits));
}

export function packGrant(input: PackGrantInput, unitCredits: number) {
  const unit = unitCreditsOf(unitCredits);
  const percent =
    Number.isFinite(input.ratioPercent) && input.ratioPercent > 0 ? input.ratioPercent : 100;
  const ratioTickets =
    input.tickets && input.tickets > 0
      ? Math.max(1, Math.trunc(input.tickets))
      : legacyTickets(input.priceCredits, percent, unit);
  const bonusTickets = Math.max(0, Math.trunc(input.bonusTickets));
  const totalTickets = ratioTickets + bonusTickets;
  return {
    /** 倍率档：礼包本身含的整张数。 */
    ratioTickets,
    bonusTickets,
    /** 到账合计张数，含赠券。 */
    totalTickets,
    totalCredits: round2(totalTickets * unit),
    /** 该活动口径下的实付 cr。 */
    priceCredits: round2((ratioTickets * unit * 100) / percent),
  };
}
