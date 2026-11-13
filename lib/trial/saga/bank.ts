/**
 * 钱庄兑换口径：双向兑换，汇率与每次行军的存金上限由后台配置，出城时冻结进本次行军。
 *
 * 存金（金币 → tcr）按 `goldPerTcr` 整档收，单趟最多 `maxGoldPerRun` 金；
 * 换金（tcr → 金币）按 `goldPerTcrBuy` 折算，必须低于存金价，防止「存 100 金换 1 tcr、
 * 再用 1 tcr 换回 100 金」的来回套利。金币只在游戏里赚、也能用 tcr 补一点，
 * 两条兑换记录都按指令 / 购买重放，客户端说了不算。
 */

export interface SagaBankPolicy {
  /** 存金：多少行军金币换 1 tcr。 */
  goldPerTcr: number;
  /** 每次行军最多存 / 换多少金币（`goldPerTcr` 的整数倍）。 */
  maxGoldPerRun: number;
  /** 换金：1 tcr 能换回多少行军金币，必须低于 `goldPerTcr`。 */
  goldPerTcrBuy: number;
}

export const DEFAULT_SAGA_BANK: SagaBankPolicy = {
  goldPerTcr: 100,
  maxGoldPerRun: 600,
  goldPerTcrBuy: 40,
};

/** 单笔换金允许的 tcr 上限；再大的量应该分批换，也防止输入框塞进天文数字。 */
export const SAGA_BANK_MAX_TCR_BUY = 10_000;

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** 脏数据一律退回默认，并保证换回价低于存金价、上限能整除存金价。 */
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

/** 一笔 tcr 能换回多少行军金币。 */
export function bankGoldForTcr(tcr: number, bank: SagaBankPolicy = DEFAULT_SAGA_BANK): number {
  const safe = Math.max(0, Math.trunc(Number(tcr) || 0));
  return safe * bank.goldPerTcrBuy;
}

/** 单趟最多还能换多少金币进游戏（已换过的金额从购买记录累计）。 */
export function bankBuyRoom(boughtGold: number, bank: SagaBankPolicy): number {
  return Math.max(0, bank.maxGoldPerRun - Math.max(0, Math.trunc(boughtGold)));
}
