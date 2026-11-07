import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, d1Run } from "@/lib/db/d1-http";
import { messages, paymentOrders, rewardClaims } from "@/lib/db/schema";
import { parseCnWallClock } from "@/lib/date";
import {
  getRechargeBonusSettings,
  normalizeTierKey,
  RECHARGE_BONUS_TOPUP_TYPE,
} from "@/lib/payment/bonus";
import { sendMessage } from "@/lib/message/messages";

export type RewardActivityKind = "recharge" | "cashback";
export type RewardClaimState = "none" | "sent" | "claimed";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RewardClaimRow {
  id: string;
  tierKey: string;
  rewardCredits: number;
  validDays: number;
  topupType: number;
  messageId: string | null;
  claimedAt: Date | null;
  createdAt: Date | null;
}

/** 一次读某用户某活动的全部发放记录；站内信已领但回写失败时，以信的 claimedAt 兜底。 */
export async function listRewardClaims(
  userId: string,
  activityKind: RewardActivityKind,
): Promise<Map<string, RewardClaimRow>> {
  const rows = await db
    .select()
    .from(rewardClaims)
    .where(and(eq(rewardClaims.userId, userId), eq(rewardClaims.activityKind, activityKind)));

  const messageIds = rows.map((row) => row.messageId).filter((id): id is string => !!id);
  const claimedByMessage = new Map<string, Date>();
  if (messageIds.length > 0) {
    const sent = await db
      .select({ id: messages.id, claimedAt: messages.claimedAt })
      .from(messages)
      .where(inArray(messages.id, messageIds));
    for (const row of sent) {
      if (row.claimedAt) claimedByMessage.set(row.id, row.claimedAt);
    }
  }

  return new Map(
    rows.map((row) => [
      row.tierKey,
      {
        id: row.id,
        tierKey: row.tierKey,
        rewardCredits: row.rewardCredits,
        validDays: row.validDays,
        topupType: row.topupType,
        messageId: row.messageId,
        claimedAt: row.claimedAt ?? (row.messageId ? (claimedByMessage.get(row.messageId) ?? null) : null),
        createdAt: row.createdAt,
      },
    ]),
  );
}

export function claimStateOf(claim: RewardClaimRow | undefined): RewardClaimState {
  if (!claim) return "none";
  return claim.claimedAt ? "claimed" : "sent";
}

/**
 * 先占发放位再发信：唯一索引挡住双击/并发，`fresh=false` 表示这一档已经发过了。
 */
export async function reserveRewardClaim(input: {
  userId: string;
  activityKind: RewardActivityKind;
  tierKey: string;
  rewardCredits: number;
  validDays: number;
  topupType: number;
}): Promise<{ id: string; fresh: boolean }> {
  const id = crypto.randomUUID();
  const { changes } = await d1Run(
    `INSERT OR IGNORE INTO reward_claim
       (id, userId, activityKind, tierKey, rewardCredits, validDays, topupType, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId,
      input.activityKind,
      input.tierKey,
      input.rewardCredits,
      input.validDays,
      input.topupType,
      Date.now(),
    ],
  );
  if (changes === 1) return { id, fresh: true };

  const existing = await db
    .select({ id: rewardClaims.id })
    .from(rewardClaims)
    .where(
      and(
        eq(rewardClaims.userId, input.userId),
        eq(rewardClaims.activityKind, input.activityKind),
        eq(rewardClaims.tierKey, input.tierKey),
      ),
    )
    .limit(1);
  if (!existing[0]) throw new Error("发放记录正在写入，请稍后刷新再试");
  return { id: existing[0].id, fresh: false };
}

export async function attachRewardMessage(claimId: string, messageId: string): Promise<void> {
  await db.update(rewardClaims).set({ messageId }).where(eq(rewardClaims.id, claimId));
}

export async function discardRewardClaim(claimId: string): Promise<void> {
  await d1Run(`DELETE FROM reward_claim WHERE id = ? AND claimedAt IS NULL`, [claimId]).catch(
    () => undefined,
  );
}

export interface RechargeTierView {
  tierKey: string;
  minCny: number;
  /** 当前后台配置的赠送额度。 */
  bonus: number;
  /** 已发放时锁定在发放记录里的额度；未发放时等于 bonus。 */
  rewardCredits: number;
  met: boolean;
  claimState: RewardClaimState;
  /** 距离这一档还差多少实付；已达标为 0。 */
  gap: number;
}

export type RechargeActivityStatus = "disabled" | "upcoming" | "active" | "ended";

export interface RechargeActivityView {
  enabled: boolean;
  active: boolean;
  status: RechargeActivityStatus;
  startDate: string;
  endDate: string;
  validDays: number;
  cumulative: number;
  tiers: RechargeTierView[];
}

function activityBounds(startDate: string, endDate: string): { startMs: number; endMs: number | null } {
  const startMs = parseCnWallClock(startDate);
  if (startMs === null) throw new Error(`充值活动开始日期非法：${startDate}`);
  const endMs = endDate ? parseCnWallClock(endDate) : null;
  return { startMs, endMs: endMs === null ? null : endMs + DAY_MS };
}

/** 活动期内的累计已支付金额（元 / LinuxDO 积分同口径）。 */
export async function rechargeCumulative(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const { startMs, endMs } = activityBounds(startDate, endDate);
  const conditions = [
    eq(paymentOrders.userId, userId),
    eq(paymentOrders.status, 2),
    gte(paymentOrders.paidAt, new Date(startMs)),
  ];
  if (endMs !== null) conditions.push(lt(paymentOrders.paidAt, new Date(endMs)));

  const rows = await db
    .select({ amount: sql<number>`COALESCE(SUM(${paymentOrders.amountCny}), 0)` })
    .from(paymentOrders)
    .where(and(...conditions));
  return Math.round(Number(rows[0]?.amount ?? 0) * 100) / 100;
}

export async function getRechargeActivity(userId: string): Promise<RechargeActivityView> {
  const settings = await getRechargeBonusSettings();
  const { startMs, endMs } = activityBounds(settings.startDate, settings.endDate);
  const now = Date.now();
  const status: RechargeActivityStatus = !settings.enabled
    ? "disabled"
    : now < startMs
      ? "upcoming"
      : endMs !== null && now >= endMs
        ? "ended"
        : "active";
  const [cumulative, claims] = await Promise.all([
    rechargeCumulative(userId, settings.startDate, settings.endDate),
    listRewardClaims(userId, "recharge"),
  ]);

  return {
    enabled: settings.enabled,
    active: status === "active",
    status,
    startDate: settings.startDate,
    endDate: settings.endDate,
    validDays: settings.validDays,
    cumulative,
    tiers: settings.tiers.map((tier) => {
      const tierKey = normalizeTierKey(tier.minCny);
      const claim = claims.get(tierKey);
      return {
        tierKey,
        minCny: tier.minCny,
        bonus: tier.bonus,
        rewardCredits: claim?.rewardCredits ?? tier.bonus,
        met: cumulative >= tier.minCny,
        claimState: claimStateOf(claim),
        gap: Math.max(0, Math.round((tier.minCny - cumulative) * 100) / 100),
      };
    }),
  };
}

/**
 * 把某一档充值奖励发到站内信。资格在服务端按当前累计重新算，活动页只是展示。
 */
export async function issueRechargeTierReward(
  userId: string,
  tierKey: string,
): Promise<{ state: RewardClaimState; reward: number }> {
  const settings = await getRechargeBonusSettings();
  if (!settings.enabled) throw new Error("限时充值活动未开启");

  const activity = await getRechargeActivity(userId);
  if (!activity.active) throw new Error("充值活动不在进行中");
  const tier = activity.tiers.find((item) => item.tierKey === tierKey);
  if (!tier) throw new Error("档位不存在，请刷新页面");
  if (!tier.met) throw new Error(`累计充值还差 ${tier.gap.toFixed(2)}，暂未达到这一档`);
  if (tier.claimState === "claimed") throw new Error("这一档奖励已经领取过了");
  if (tier.claimState === "sent") return { state: "sent", reward: tier.bonus };

  const reserved = await reserveRewardClaim({
    userId,
    activityKind: "recharge",
    tierKey,
    rewardCredits: tier.bonus,
    validDays: settings.validDays,
    topupType: RECHARGE_BONUS_TOPUP_TYPE,
  });
  if (!reserved.fresh) return { state: "sent", reward: tier.bonus };

  try {
    const messageId = await sendMessage({
      userId,
      kind: "reward",
      title: `限时充值活动 · 累计满 ${tier.minCny} 奖励`,
      body: [
        `你在本期限时充值活动中累计实付 ${activity.cumulative.toFixed(2)}，已达到「累计满 ${tier.minCny}」档位。`,
        `奖励 ${tier.bonus.toFixed(2)} cr 已发放，请在站内信领取；领取后进入临时余额，有效期 ${settings.validDays} 天。`,
        `活动时间：${settings.startDate} 起${settings.endDate ? `至 ${settings.endDate}` : "，结束时间另行通知"}。`,
      ].join("\n"),
      attachment: {
        kind: "temp_credits",
        credits: tier.bonus,
        validDays: settings.validDays,
        topupType: RECHARGE_BONUS_TOPUP_TYPE,
        rewardClaimId: reserved.id,
      },
    });
    await attachRewardMessage(reserved.id, messageId);
  } catch (err) {
    await discardRewardClaim(reserved.id);
    throw err;
  }

  return { state: "sent", reward: tier.bonus };
}