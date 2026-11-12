import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db/d1-http";
import { rewardClaims, usageLogs, users } from "@/lib/db/schema";
import { cnStartOfToday, parseCnWallClock } from "@/lib/date";
import { maskUserLabel } from "@/lib/mask";
import {
  activityWindowOf,
  attachRewardMessage,
  claimStateOf,
  discardRewardClaim,
  listRewardClaims,
  reserveRewardClaim,
  type RechargeActivityStatus,
  type RewardClaimState,
  type RewardKind,
} from "@/lib/rewards/claims";
import { sendMessage, type Attachment } from "@/lib/message/messages";
import { getRechargeBonusSettings } from "@/lib/payment/bonus";
import { getCashbackSettings } from "@/lib/settings";
import {
  cashbackTierKey,
  rollCashbackReward,
  type CashbackReward,
  type CashbackTier,
} from "@/lib/cashback/config";
import { resolveActivities, type ActivityKind } from "@/lib/activity/coupons";
import { formatAmount, normalizeCurrencyText } from "@/lib/billing/units";

export type CashbackSettings = Awaited<ReturnType<typeof getCashbackSettings>>;

/** 钱包流水里消费返利占用的 type（1–7 已被兑换码/管理员/签到/注册奖励/在线充值/抽奖/邀请占了）。 */
export const CASHBACK_TOPUP_TYPE = 8;

const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** 与充值活动同一段时间：开始日 00:00 起、结束日次日 00:00 止（北京时间）。 */
function windowBounds(startDate: string, endDate: string): { startMs: number; endMs: number | null } {
  const startMs = parseCnWallClock(startDate);
  if (startMs === null) throw new Error(`活动开始日期非法：${startDate}`);
  const endMs = endDate ? parseCnWallClock(endDate) : null;
  return { startMs, endMs: endMs === null ? null : endMs + DAY_MS };
}

/** 活动期内该用户的累计消费（credits）。失败调用记 0，所以不用按状态过滤。 */
export async function consumptionCumulative(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const { startMs, endMs } = windowBounds(startDate, endDate);
  const conditions = [eq(usageLogs.userId, userId), gte(usageLogs.createdAt, new Date(startMs))];
  if (endMs !== null) conditions.push(lt(usageLogs.createdAt, new Date(endMs)));

  const rows = await db
    .select({ credits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)` })
    .from(usageLogs)
    .where(and(...conditions));
  return round2(Number(rows[0]?.credits ?? 0));
}

/** 某时刻起该用户的累计消耗，用于页面上的「本期用量」数字。 */
export async function sumCreditsSince(userId: string, startMs: number): Promise<number> {
  const rows = await db
    .select({ credits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)` })
    .from(usageLogs)
    .where(and(eq(usageLogs.userId, userId), gte(usageLogs.createdAt, new Date(startMs))));
  return round2(Number(rows[0]?.credits ?? 0));
}

const fmt = (v: number) => String(round2(v));

/** 后台配置的一档奖励区间，展示成一句人话。 */
export function rewardRangeLabel(tier: CashbackTier): string {
  return `随机 ${fmt(tier.minReward)}–${fmt(tier.maxReward)} tcr 或 cr，或至多 3 张转盘活动券`;
}

/** 发放时随机挑一个「当前开着」的活动作为券落点；没有活动时券奖励降级成 tcr。 */
export interface CouponTarget {
  kind: ActivityKind;
  activityKey: string;
  couponName: string;
  unitCredits: number;
}

export async function pickCouponTarget(random: () => number = Math.random): Promise<CouponTarget | null> {
  const activities = (await resolveActivities()).filter(
    (item) => item.status === "active" && Boolean(item.activityKey),
  );
  if (activities.length === 0) return null;
  const index = Math.min(activities.length - 1, Math.floor(random() * activities.length));
  const picked = activities[index];
  return {
    kind: picked.kind,
    activityKey: picked.activityKey as string,
    couponName: picked.couponName,
    unitCredits: picked.unitCredits,
  };
}

export interface CashbackTierView {
  tierKey: string;
  minCredits: number;
  minReward: number;
  maxReward: number;
  /** 未发放时展示配置区间；已发放时改成锁定下来的奖励名。 */
  rangeLabel: string;
  met: boolean;
  /** 距离这一档还差多少累计消费；已达标为 0。 */
  gap: number;
  claimState: RewardClaimState;
  /** 已发放时锁定的奖励形态；未发放为 null。 */
  rewardKind: RewardKind | null;
  /** 已发放时锁定的奖励名（如「活动券 ×2」「星轨券 88 cr」）。 */
  rewardLabel: string | null;
}

export interface CashbackActivityView {
  enabled: boolean;
  active: boolean;
  status: RechargeActivityStatus;
  startDate: string;
  endDate: string;
  validDays: number;
  cumulative: number;
  tiers: CashbackTierView[];
}

export async function getCashbackActivity(userId: string): Promise<CashbackActivityView> {
  const [settings, bonus] = await Promise.all([getCashbackSettings(), getRechargeBonusSettings()]);
  const { status } = activityWindowOf(settings.enabled, bonus.startDate, bonus.endDate);
  const [cumulative, claims] = await Promise.all([
    consumptionCumulative(userId, bonus.startDate, bonus.endDate),
    listRewardClaims(userId, "cashback"),
  ]);

  return {
    enabled: settings.enabled,
    active: status === "active",
    status,
    startDate: bonus.startDate,
    endDate: bonus.endDate,
    validDays: settings.validDays,
    cumulative,
    tiers: settings.tiers.map((tier) => {
      const tierKey = cashbackTierKey(tier.minCredits);
      const claim = claims.get(tierKey);
      return {
        tierKey,
        minCredits: tier.minCredits,
        minReward: tier.minReward,
        maxReward: tier.maxReward,
        rangeLabel: normalizeCurrencyText(claim?.rewardLabel) ?? rewardRangeLabel(tier),
        met: cumulative >= tier.minCredits,
        gap: Math.max(0, round2(tier.minCredits - cumulative)),
        claimState: claimStateOf(claim),
        rewardKind: claim?.rewardKind ?? null,
        rewardLabel: normalizeCurrencyText(claim?.rewardLabel),
      };
    }),
  };
}

function rewardAttachment(reward: CashbackReward, validDays: number, claimId: string): Attachment {
  switch (reward.kind) {
    case "permanent_credits":
      return {
        kind: "credits",
        credits: reward.credits,
        topupType: CASHBACK_TOPUP_TYPE,
        rewardClaimId: claimId,
      };
    case "tickets":
      return { kind: "tickets", count: reward.tickets, rewardClaimId: claimId };
    case "coupon": {
      if (!reward.coupon) throw new Error("活动券奖励缺少券信息");
      return {
        kind: "coupon",
        activityKind: reward.coupon.kind,
        activityKey: reward.coupon.activityKey,
        couponName: reward.coupon.couponName,
        unitCredits: reward.coupon.unitCredits,
        tickets: reward.coupon.tickets,
        credits: reward.coupon.credits,
        rewardClaimId: claimId,
      };
    }
    default:
      return {
        kind: "temp_credits",
        credits: reward.credits,
        validDays,
        topupType: CASHBACK_TOPUP_TYPE,
        rewardClaimId: claimId,
      };
  }
}

function arrivalText(reward: CashbackReward, validDays: number): string {
  switch (reward.kind) {
    case "permanent_credits":
      return `领取后 ${formatAmount(reward.credits)} cr 直接到账，不过期。`;
    case "tickets":
      return "领取后活动券直接入账，可去幸运转盘使用。";
    case "coupon":
      return "领取后进入当期活动券；当期活动结束后作废。";
    default:
      return `领取后 ${formatAmount(reward.credits)} tcr 到账，${validDays} 天内有效。`;
  }
}

/**
 * 把某一档消费返利发到站内信。
 *
 * 资格在服务端按当前累计重新算，活动页只是展示；随机结果在发放时锁定进
 * `reward_claim`，之后改配置不影响已发出的这封信。
 */
export async function issueCashbackTierReward(
  userId: string,
  tierKey: string,
): Promise<{ state: RewardClaimState; rewardLabel: string }> {
  const settings = await getCashbackSettings();
  if (!settings.enabled) throw new Error("消费返利活动未开启");

  const activity = await getCashbackActivity(userId);
  if (!activity.active) throw new Error("消费返利不在进行中");
  const tierView = activity.tiers.find((item) => item.tierKey === tierKey);
  if (!tierView) throw new Error("档位不存在，请刷新页面");
  if (!tierView.met) throw new Error(`累计消费还差 ${tierView.gap.toFixed(2)} cr 等值，暂未达到这一档`);
  if (tierView.claimState === "claimed") throw new Error("这一档奖励已经领取过了");
  if (tierView.claimState === "sent") {
    return { state: "sent", rewardLabel: tierView.rewardLabel ?? "奖励已发放" };
  }

  const tier = settings.tiers.find((item) => cashbackTierKey(item.minCredits) === tierKey);
  if (!tier) throw new Error("档位配置已变更，请刷新页面");

  const reward = rollCashbackReward(tier, await pickCouponTarget());
  const reserved = await reserveRewardClaim({
    userId,
    activityKind: "cashback",
    tierKey,
    rewardCredits: reward.kind === "tickets" ? 0 : reward.credits,
    validDays: settings.validDays,
    topupType: CASHBACK_TOPUP_TYPE,
    rewardKind: reward.kind,
    rewardLabel: reward.label,
  });
  if (!reserved.fresh) {
    const rows = await db
      .select({ rewardLabel: rewardClaims.rewardLabel })
      .from(rewardClaims)
      .where(eq(rewardClaims.id, reserved.id))
      .limit(1);
    return { state: "sent", rewardLabel: normalizeCurrencyText(rows[0]?.rewardLabel) ?? reward.label };
  }

  try {
    const messageId = await sendMessage({
      userId,
      kind: "reward",
      title: `消费返利 · 累计满 ${fmt(tierView.minCredits)} cr 等值`,
      body: [
        `你在本期消费返利活动中累计消费 ${fmt(activity.cumulative)} cr 等值，已达到「累计满 ${fmt(tierView.minCredits)} cr 等值」档位。`,
        `本次随机奖励：${reward.label}。`,
        arrivalText(reward, settings.validDays),
        `活动时间：${activity.startDate} 起${activity.endDate ? `至 ${activity.endDate}` : "，结束时间另行通知"}（与限时充值活动同一时间段）。`,
      ].join("\n"),
      attachment: rewardAttachment(reward, settings.validDays, reserved.id),
    });
    await attachRewardMessage(reserved.id, messageId);
  } catch (err) {
    await discardRewardClaim(reserved.id);
    throw err;
  }

  return { state: "sent", rewardLabel: reward.label };
}

export interface LeaderboardRow {
  rank: number;
  label: string;
  credits: number;
  isSelf: boolean;
}

/** 冲榜窗口起点（北京时间口径），页面上的「本期用量」与排行榜必须同一个窗口。 */
export function leaderboardStartMs(s: CashbackSettings): number {
  return cnStartOfToday().getTime() - Math.trunc(s.leaderboardDays) * DAY_MS;
}

/**
 * 用量冲榜：窗口内按用户汇总消耗。
 * D1 上 `ORDER BY` 聚合表达式或 SELECT 别名都会解析失败，所以 SQL 只 group，排序放 JS。
 *
 * 这是全站级扫描（不按 userId 过滤），而榜单只做展示、返利发放不依赖它；
 * 聚合结果按「窗口起点」缓存 2 分钟，避免每次打开活动页都重扫一遍窗口内的 `usage_log`。
 */
const loadLeaderboardTotals = unstable_cache(
  async (startMs: number): Promise<{ userId: string; credits: number }[]> => {
    const rows = await db
      .select({
        userId: usageLogs.userId,
        credits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
      })
      .from(usageLogs)
      .where(gte(usageLogs.createdAt, new Date(startMs)))
      .groupBy(usageLogs.userId);
    return rows.map((row) => ({ userId: row.userId, credits: Number(row.credits) }));
  },
  ["cashback-leaderboard"],
  { revalidate: 120 },
);

export async function getUsageLeaderboard(
  s: CashbackSettings,
  selfUserId: string,
): Promise<LeaderboardRow[]> {
  const rows = await loadLeaderboardTotals(leaderboardStartMs(s));

  const ranked = rows
    .filter((r) => r.credits > 0)
    .sort((a, b) => b.credits - a.credits)
    .slice(0, s.leaderboardSize);
  if (ranked.length === 0) return [];

  const identities = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(inArray(users.id, ranked.map((r) => r.userId)));
  const byId = new Map(identities.map((u) => [u.id, u]));

  return ranked.map((r, i) => ({
    rank: i + 1,
    label:
      r.userId === selfUserId
        ? (byId.get(r.userId)?.name ?? "我")
        : maskUserLabel(byId.get(r.userId)?.email ?? null, byId.get(r.userId)?.name ?? null, r.userId),
    credits: round2(Number(r.credits)),
    isSelf: r.userId === selfUserId,
  }));
}
