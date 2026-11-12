/**
 * 钱庄兑换口径：局内金币与 tcr 两个方向都要有足够厚的价差，才不会被刷成印钞机。
 *
 * 平定一处的金币是 255 + 110×地方序（第一处 255、第八处 1025），而一次出城只花 5 cr；
 * 若按 1 金 = 10 tcr，单趟就能换出几千 tcr。这里改成 100 金 = 1 tcr 并封顶 3 tcr/趟：
 * 半途收兵刷金也换不回 5 cr 的军令钱，全通一处的兑换收益则与平定奖励同一量级。
 *
 * 反向 1 tcr = 50 金，两向价差 2:1：100 金卖出去换 1 tcr，买回 100 金却要 2 tcr，
 * 低买高卖无利可图。金币包用固定档位，服务端按档位定义加金，不信任客户端金额。
 */

/** 金币 → tcr：100 金 = 1 tcr。 */
export const SAGA_BANK_GOLD_PER_TCR = 100;

/** 每次行军最多换出的 tcr（300 金）。 */
export const SAGA_BANK_MAX_TCR_PER_RUN = 3;

/** 每次行军的存金上限，按上面的汇率折算。 */
export const SAGA_BANK_MAX_GOLD_PER_RUN = SAGA_BANK_GOLD_PER_TCR * SAGA_BANK_MAX_TCR_PER_RUN;

/** tcr → 金币：1 tcr = 50 金。 */
export const SAGA_BANK_TCR_TO_GOLD = 50;

export interface SagaGoldPack {
  id: string;
  gold: number;
  tcr: number;
}

/** 用 tcr 换金的固定档位；8 tcr 的通关奖励刚好够 400 金，能配齐最好的武器与防具。 */
export const SAGA_GOLD_PACKS: SagaGoldPack[] = [
  { id: "gold_50", gold: 50, tcr: 1 },
  { id: "gold_100", gold: 100, tcr: 2 },
  { id: "gold_200", gold: 200, tcr: 4 },
];

export const SAGA_GOLD_PACK_BY_ID = new Map(SAGA_GOLD_PACKS.map((pack) => [pack.id, pack]));

/** 一笔存金能结算多少 tcr；重放侧已保证是 100 的整数倍，这里再做一次封顶。 */
export function bankCreditsForGold(gold: number): number {
  const safe = Math.max(0, Math.trunc(Number(gold) || 0));
  return Math.min(SAGA_BANK_MAX_TCR_PER_RUN, Math.floor(safe / SAGA_BANK_GOLD_PER_TCR));
}
