import type { ActivityKind } from "@/lib/db/schema";

/**
 * 限时消费返利：与充值活动同一时间段，按活动期内累计消费发阶梯奖励。
 *
 * 每档在发放时随机一种奖励：临时货币 / 永久货币 / 活动券 / 抽奖券；
 * 奖励数值在后台配置的区间内随机，档位越高区间越高。配置与发放逻辑分离，
 * 抽奖函数是纯函数，回归测试可注入随机数。
 */

export interface CashbackTier {
  /** 活动期内累计消费下限（credits）。 */
  minCredits: number;
  minReward: number;
  maxReward: number;
}

/** 推荐默认：五档，区间递增，最高档封顶 1200 cr。后台可改。 */
export const DEFAULT_CASHBACK_TIERS: CashbackTier[] = [
  { minCredits: 500, minReward: 10, maxReward: 100 },
  { minCredits: 2000, minReward: 20, maxReward: 200 },
  { minCredits: 5000, minReward: 50, maxReward: 400 },
  { minCredits: 10000, minReward: 100, maxReward: 700 },
  { minCredits: 20000, minReward: 200, maxReward: 1200 },
];

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** 管理员手写 JSON 可能畸形：丢非法行、去重、按门槛升序，最多 10 档。 */
export function sanitizeCashbackTiers(raw: unknown): CashbackTier[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<number>();
  const tiers: CashbackTier[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    const minCredits = Number(row.minCredits);
    const minReward = Number(row.minReward);
    const maxReward = Number(row.maxReward);
    if (!Number.isFinite(minCredits) || minCredits <= 0) continue;
    if (!Number.isFinite(minReward) || minReward <= 0) continue;
    if (!Number.isFinite(maxReward) || maxReward < minReward) continue;
    const key = round2(minCredits);
    if (seen.has(key)) continue;
    seen.add(key);
    tiers.push({
      minCredits: key,
      minReward: round2(minReward),
      maxReward: round2(maxReward),
    });
  }
  return tiers.sort((a, b) => a.minCredits - b.minCredits).slice(0, 10);
}

/** 档位唯一键跟着累计门槛走：改奖励区间不影响已发记录，改门槛就是另一档。 */
export function cashbackTierKey(minCredits: number): string {
  return String(round2(minCredits));
}

export type CashbackRewardKind = "temp_credits" | "permanent_credits" | "coupon" | "tickets";

export interface CashbackCouponReward {
  kind: ActivityKind;
  activityKey: string;
  couponName: string;
  /** 1 张活动券的 cr 单价。 */
  unitCredits: number;
  /** 整张数（不发零头）。 */
  tickets: number;
  /** 到账券面 = tickets × unitCredits。 */
  credits: number;
}

export interface CashbackReward {
  kind: CashbackRewardKind;
  /** 货币/活动券的 credits；抽奖券为 0。 */
  credits: number;
  /** 抽奖券张数；其他形态为 0。 */
  tickets: number;
  /** 展示名，发放时锁定进 reward_claim。 */
  label: string;
  coupon?: CashbackCouponReward;
}

const KIND_CUTOFFS: { kind: CashbackRewardKind; max: number }[] = [
  { kind: "temp_credits", max: 0.4 },
  { kind: "permanent_credits", max: 0.7 },
  { kind: "coupon", max: 0.9 },
  { kind: "tickets", max: 1 },
];

/**
 * 随机奖励。`random` 返回 [0,1)，按序取三次：形态、金额、抽奖券张数。
 *
 * `couponTarget` 由调用方从「当前开着的活动」里随机选一个传入；没有可发券的活动时，
 * 活动券会降级成临时货币，避免发出一张领不到当期券的空头奖励。
 */
export function rollCashbackReward(
  tier: CashbackTier,
  couponTarget: {
    kind: ActivityKind;
    activityKey: string;
    couponName: string;
    unitCredits: number;
  } | null,
  random: () => number = Math.random,
): CashbackReward {
  const kindRoll = random();
  const picked = KIND_CUTOFFS.find((item) => kindRoll < item.max) ?? KIND_CUTOFFS[KIND_CUTOFFS.length - 1];
  const amount = round2(
    Math.min(tier.maxReward, Math.max(tier.minReward, tier.minReward + random() * (tier.maxReward - tier.minReward))),
  );

  if (picked.kind === "coupon" && couponTarget) {
    const unit = Math.max(1, couponTarget.unitCredits);
    const tickets = Math.max(1, Math.floor(amount / unit));
    const face = round2(tickets * unit);
    return {
      kind: "coupon",
      credits: face,
      tickets: 0,
      label: `${couponTarget.couponName} ×${tickets}`,
      coupon: { ...couponTarget, tickets, credits: face },
    };
  }
  if (picked.kind === "tickets") {
    const count = 1 + Math.min(2, Math.floor(random() * 3));
    return { kind: "tickets", credits: 0, tickets: count, label: `抽奖券 ×${count}` };
  }
  if (picked.kind === "permanent_credits") {
    return { kind: "permanent_credits", credits: amount, tickets: 0, label: `${amount} cr 永久货币` };
  }
  // 活动券没有可发的活动时也落到这里：奖励不落空，按临时货币发。
  return { kind: "temp_credits", credits: amount, tickets: 0, label: `${amount} cr 临时货币` };
}
