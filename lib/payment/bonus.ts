import { db } from "@/lib/db/d1-http";
import { temporaryBalances, topups } from "@/lib/db/schema";
import { getSettingsMap } from "@/lib/settings";

/**
 * 充值阶梯赠送：按订单实付金额取「满足的最高档」送一次固定额度。
 *
 * 赠送走**临时余额 + 有效期**，不并进永久余额：付费用户的主充值本来就是永久的，
 * 赠送带期限既能做促销又不让存量无限堆积。
 */

/** 钱包流水 type=10 充值赠送。 */
export const RECHARGE_BONUS_TOPUP_TYPE = 10;

export interface RechargeBonusTier {
  /** 实付金额下限（元或积分，与订单 amountCny 同口径）。 */
  minCny: number;
  /** 满足该档时赠送的 credits。 */
  bonus: number;
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
  });

  let tiers: RechargeBonusTier[] = [];
  try {
    tiers = sanitizeBonusTiers(JSON.parse(cfg.recharge_bonus_tiers));
  } catch {
    tiers = [];
  }

  return {
    enabled: Boolean(cfg.recharge_bonus_enabled),
    tiers,
    validDays: Number.isFinite(cfg.recharge_bonus_valid_days)
      ? Math.min(365, Math.max(1, cfg.recharge_bonus_valid_days))
      : 30,
  };
}

/** 取实付金额能满足的最高一档；没到任何档位返回 0。 */
export function pickBonusCredits(amountCny: number, tiers: RechargeBonusTier[]): number {
  let best = 0;
  for (const tier of tiers) {
    if (amountCny >= tier.minCny) best = Math.max(best, tier.bonus);
  }
  return best;
}

/**
 * 在一笔订单结算成功后发赠送。
 *
 * 只在 `settleOrder` 的「抢占成功」分支里被调用，重复回调进不到这里，所以不需要额外幂等键；
 * 赠送本身失败**不能**让主充值流程回滚（用户的钱已经到账），只记错误日志。
 */
export async function grantRechargeBonus(input: {
  userId: string;
  orderNo: string;
  amountCny: number;
}): Promise<number> {
  const settings = await getRechargeBonusSettings();
  if (!settings.enabled) return 0;

  const bonus = pickBonusCredits(input.amountCny, settings.tiers);
  if (bonus <= 0) return 0;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + settings.validDays * 24 * 60 * 60 * 1000);
  const description = `充值赠送 ${bonus.toFixed(2)} cr（订单 ${input.orderNo}，有效期至 ${expiresAt.toLocaleDateString("zh-CN")}）`;

  await db.insert(temporaryBalances).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    amount: bonus,
    expiresAt,
    description,
    createdAt: now,
  });
  await db.insert(topups).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    amount: bonus,
    type: RECHARGE_BONUS_TOPUP_TYPE,
    description,
    createdAt: now,
  });

  return bonus;
}
