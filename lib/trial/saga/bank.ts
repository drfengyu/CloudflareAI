/**
 * 钱庄兑换口径：只把游戏金币存成 tcr，不开放 tcr 换金币。
 *
 * 平定一处的金币是 255 + 110×地方序（第一处 255、第八处 1025），而一次出城只花 5 cr；
 * 若按 1 金 = 10 tcr，单趟就能换出几千 tcr。这里改成 100 金 = 1 tcr 并封顶 3 tcr/趟：
 * 半途收兵刷金也换不回 5 cr 的军令钱，全通一处的兑换收益则与平定奖励同一量级。
 *
 * 反向不开放：tcr 能买金币，等于用充值余额直接换战力，还会把住店、装备的金币定价冲垮；
 * 金币的来源与去向都留在游戏内（战斗得金、铁匠铺 / 药铺 / 客栈花金），只把结余单向存进钱庄。
 */

/** 金币 → tcr：100 金 = 1 tcr。 */
export const SAGA_BANK_GOLD_PER_TCR = 100;

/** 每次行军最多换出的 tcr（300 金）。 */
export const SAGA_BANK_MAX_TCR_PER_RUN = 3;

/** 每次行军的存金上限，按上面的汇率折算。 */
export const SAGA_BANK_MAX_GOLD_PER_RUN = SAGA_BANK_GOLD_PER_TCR * SAGA_BANK_MAX_TCR_PER_RUN;

/** 一笔存金能结算多少 tcr；重放侧已保证是 100 的整数倍，这里再做一次封顶。 */
export function bankCreditsForGold(gold: number): number {
  const safe = Math.max(0, Math.trunc(Number(gold) || 0));
  return Math.min(SAGA_BANK_MAX_TCR_PER_RUN, Math.floor(safe / SAGA_BANK_GOLD_PER_TCR));
}
