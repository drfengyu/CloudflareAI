import { parseCnWallClock } from "@/lib/date";
import { getSettingsMap } from "@/lib/settings";

/**
 * 限时充值活动：按活动期内的累计实付金额发阶梯奖励。
 *
 * 奖励不再随订单自动到账，而是用户在活动页逐档手动发放到站内信，再在站内信领取；
 * 资格一律按「开始日期 00:00（北京）之后、结束日期次日 00:00 之前」的已支付订单累计，
 * 避免把活动前已经发过赠送的历史订单再算一遍。
 */

/** 钱包流水 type=10 充值赠送。 */
export const RECHARGE_BONUS_TOPUP_TYPE = 10;

/** 未配置开始日期时的默认值：v0.31.0 上线当天，活动前的历史订单不参与累计。 */
export const RECHARGE_ACTIVITY_DEFAULT_START = "2026-11-07";

export interface RechargeBonusTier {
  /** 累计实付金额下限（元；LinuxDO 积分同口径）。 */
  minCny: number;
  /** 满足该档时赠送的 credits。 */
  bonus: number;
}

function isCnDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && parseCnWallClock(value) !== null;
}

/** 档位唯一键跟着门槛金额走：改赠送额度不影响已发记录，改门槛就是另一档。 */
export function normalizeTierKey(minCny: number): string {
  return String(Math.round(minCny * 100) / 100);
}

/** 管理员手写 JSON 可能畸形，读侧统一裁剪：丢非数字、去重、按门槛升序，最多 20 档。 */
export function sanitizeBonusTiers(raw: unknown): RechargeBonusTier[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<number>();
  const tiers: RechargeBonusTier[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const minCny = Number((item as Record<string, unknown>).minCny);
    const bonus = Number((item as Record<string, unknown>).bonus);
    if (!Number.isFinite(minCny) || minCny <= 0) continue;
    if (!Number.isFinite(bonus) || bonus <= 0) continue;
    if (seen.has(minCny)) continue;
    seen.add(minCny);
    tiers.push({ minCny, bonus });
  }
  return tiers
    .sort((a, b) => a.minCny - b.minCny)
    .slice(0, 20);
}

export async function getRechargeBonusSettings() {
  const cfg = await getSettingsMap({
    recharge_bonus_enabled: false,
    recharge_bonus_valid_days: 30,
    recharge_bonus_tiers: "[]",
    recharge_bonus_start_date: RECHARGE_ACTIVITY_DEFAULT_START,
    recharge_bonus_end_date: "",
  });

  let tiers: RechargeBonusTier[] = [];
  try {
    tiers = sanitizeBonusTiers(JSON.parse(cfg.recharge_bonus_tiers));
  } catch {
    tiers = [];
  }

  const startDate = isCnDate(cfg.recharge_bonus_start_date)
    ? cfg.recharge_bonus_start_date
    : RECHARGE_ACTIVITY_DEFAULT_START;
  const rawEnd = isCnDate(cfg.recharge_bonus_end_date) ? cfg.recharge_bonus_end_date : "";
  // 结束日期早于开始日期视为没填，避免窗口为空导致所有档位永远不可领。
  const endDate = rawEnd && rawEnd >= startDate ? rawEnd : "";

  return {
    enabled: Boolean(cfg.recharge_bonus_enabled),
    tiers,
    validDays: Number.isFinite(cfg.recharge_bonus_valid_days)
      ? Math.min(365, Math.max(1, cfg.recharge_bonus_valid_days))
      : 30,
    startDate,
    endDate,
  };
}