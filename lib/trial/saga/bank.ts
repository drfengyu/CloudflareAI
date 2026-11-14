/**
 * 钱庄口径：金币 → tcr 单向存金。汇率与每次行军的存金上限由后台配置，
 * 出城时冻结进本次行军；金币只能在战斗里缴获，收兵时按 `goldPerTcr` 折成 tcr。
 * 存金按指令重放，客户端说了不算；v0.55 起不再开放 tcr → 金币。
 */

export interface SagaBankPolicy {
  /** 存金：多少行军金币换 1 tcr。 */
  goldPerTcr: number;
  /** 每次行军最多存多少金币（`goldPerTcr` 的整数倍）。 */
  maxGoldPerRun: number;
  /**
   * 旧版换金（tcr → 金币）的兑换价，只用于读回历史 `bank_gold` 购买记录，
   * v0.55 起钱庄不再开放换金。
   */
  goldPerTcrBuy: number;
}

export const DEFAULT_SAGA_BANK: SagaBankPolicy = {
  goldPerTcr: 100,
  maxGoldPerRun: 600,
  goldPerTcrBuy: 40,
};

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** 脏数据一律退回默认，并保证上限能整除存金价；旧换金价只校验历史记录。 */
export function sanitizeSagaBank(raw: unknown): SagaBankPolicy {
  const d = DEFAULT_SAGA_BANK;
  if (!raw || typeof raw !== "object") return { ...d };
  const it = raw as Partial<SagaBankPolicy>;
  const goldPerTcr = boundedInteger(it.goldPerTcr, d.goldPerTcr, 2, 1_000_000);
  const maxGoldPerRun = Math.max(
    goldPerTcr,
    Math.floor(boundedInteger(it.maxGoldPerRun, d.maxGoldPerRun, 0, 100_000_000) / goldPerTcr) *
      goldPerTcr,
  );
  const goldPerTcrBuy = Math.min(
    goldPerTcr - 1,
    boundedInteger(it.goldPerTcrBuy, d.goldPerTcrBuy, 1, 1_000_000),
  );
  return { goldPerTcr, maxGoldPerRun, goldPerTcrBuy };
}

/** 一笔存金能结算多少 tcr；重放侧已保证是 `goldPerTcr` 的整数倍，这里再做一次封顶。 */
export function bankCreditsForGold(gold: number, bank: SagaBankPolicy = DEFAULT_SAGA_BANK): number {
  const safe = Math.max(0, Math.trunc(Number(gold) || 0));
  const cap = Math.floor(bank.maxGoldPerRun / bank.goldPerTcr);
  return Math.min(cap, Math.floor(safe / bank.goldPerTcr));
}

/**
 * 钱庄金币换活动券：虚拟商品 ID。
 *
 * 汇率与「1 张 = X cr」一致，也就是 1 张试炼券 = X 金；
 * 记录写进行军的 purchases，重放时按 `goldCost` 扣金币，券本身在服务端即时入账。
 */
export const SAGA_COUPON_ITEM_ID = "coupon";

/** 单笔最多换多少张，与活动券兑换接口的上限一致。 */
export const SAGA_MAX_COUPON_TICKETS = 100_000;

/** 换券要花的金币；金币是整数，券价有小数时向上取整到整金。 */
export function couponGoldCost(tickets: number, goldPerTicket: number): number {
  const count = Math.max(0, Math.trunc(Number(tickets) || 0));
  const unit = Math.max(0, Number(goldPerTicket) || 0);
  if (count <= 0 || unit <= 0) return 0;
  return Math.min(9_999_999, Math.ceil(count * unit - 1e-9));
}

/** 手上金币最多能换多少张券。 */
export function couponsForGold(gold: number, goldPerTicket: number): number {
  const unit = Math.max(0, Number(goldPerTicket) || 0);
  if (unit <= 0) return 0;
  const safe = Math.max(0, Math.trunc(Number(gold) || 0));
  return Math.min(SAGA_MAX_COUPON_TICKETS, Math.floor(safe / unit + 1e-9));
}
