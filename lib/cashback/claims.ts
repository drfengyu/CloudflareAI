import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/d1-http";
import { cashbackClaims, usageLogs, users } from "@/lib/db/schema";
import { cnDateString, parseCnWallClock, shiftDateString } from "@/lib/date";
import { maskUserLabel } from "@/lib/mask";
import {
  attachRewardMessage,
  claimStateOf,
  discardRewardClaim,
  listRewardClaims,
  reserveRewardClaim,
  type RewardClaimState,
} from "@/lib/rewards/claims";
import { sendMessage } from "@/lib/message/messages";
import type { getCashbackSettings } from "@/lib/settings";

export type CashbackSettings = Awaited<ReturnType<typeof getCashbackSettings>>;

/** 钱包流水里消费返利占用的 type（1–7 已被兑换码/管理员/签到/注册奖励/在线充值/抽奖/邀请占了）。 */
export const CASHBACK_TOPUP_TYPE = 8;

const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** 北京自然日 `[date 00:00, 次日 00:00)` 的真实毫秒边界。 */
function dayBounds(date: string): { start: number; end: number } {
  const parsed = parseCnWallClock(date);
  if (parsed === null) throw new Error(`非法日期：${date}`);
  return { start: parsed, end: parsed + DAY_MS };
}

/** 该用户在某个北京自然日的真实消费（credits）。失败调用记 0，所以不用按 status 过滤。 */
export async function consumedOnDay(userId: string, date: string): Promise<number> {
  const { start, end } = dayBounds(date);
  const rows = await db
    .select({ credits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)` })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.userId, userId),
        gte(usageLogs.createdAt, new Date(start)),
        lt(usageLogs.createdAt, new Date(end)),
      ),
    );
  return Number(rows[0]?.credits ?? 0);
}

/** 按比例算返利，已套起返门槛与单日封顶；不足门槛或不大于 0 都返回 0。 */
export function rewardFor(consumed: number, s: CashbackSettings): number {
  if (consumed < s.minCredits) return 0;
  return round2(Math.min(consumed * s.rate, s.cap));
}

/** 某时刻起该用户的累计消耗，用于页面上的「本期用量」数字。 */
export async function sumCreditsSince(userId: string, startMs: number): Promise<number> {
  const rows = await db
    .select({ credits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)` })
    .from(usageLogs)
    .where(and(eq(usageLogs.userId, userId), gte(usageLogs.createdAt, new Date(startMs))));
  return Number(rows[0]?.credits ?? 0);
}

export interface CashbackDay {
  /** 北京自然日 `YYYY-MM-DD`。 */
  date: string;
  consumed: number;
  reward: number;
  /** 已领过 / 未达门槛 / 活动关闭 时不可领。 */
  claimable: boolean;
  /** none=未发放 / sent=已发到站内信待领 / claimed=已领取。 */
  claimState: RewardClaimState;
  note: string;
}

/**
 * 最近 `backfillDays` 个**已结束**的自然日（今天不算）逐日给出消费与返利。
 * 一次读全部已领记录 + 每日一条汇总，天数最多 31，不会撑爆 D1 的绑定参数。
 */
export async function listRecentDays(userId: string, s: CashbackSettings): Promise<CashbackDay[]> {
  const today = cnDateString();
  const dates: string[] = [];
  for (let i = 1; i <= s.backfillDays; i++) dates.push(shiftDateString(today, -i));

  const [claimedRows, rewardClaimMap] = await Promise.all([
    db
      .select({ periodDate: cashbackClaims.periodDate })
      .from(cashbackClaims)
      .where(and(eq(cashbackClaims.userId, userId), inArray(cashbackClaims.periodDate, dates))),
    listRewardClaims(userId, "cashback"),
  ]);
  const legacyClaimed = new Set(claimedRows.map((r) => r.periodDate));

  const days = await Promise.all(
    dates.map(async (date) => ({ date, consumed: await consumedOnDay(userId, date) })),
  );

  return days.map(({ date, consumed }) => {
    const claim = rewardClaimMap.get(date);
    // 已发放的返利按发放时锁定的额度展示，之后再改配置不影响这封信。
    const reward = claim?.rewardCredits ?? rewardFor(consumed, s);
    const claimState = claimStateOf(claim);
    if (legacyClaimed.has(date) || claimState === "claimed") {
      return { date, consumed, reward, claimState: "claimed", claimable: false, note: "已领取" };
    }
    if (claimState === "sent") {
      return { date, consumed, reward, claimState: "sent", claimable: false, note: "已发至站内信" };
    }
    if (!s.enabled) {
      return { date, consumed, reward, claimState: "none", claimable: false, note: "活动未开启" };
    }
    if (reward <= 0) {
      return { date, consumed, reward, claimState: "none", claimable: false, note: "未达起返门槛" };
    }
    return { date, consumed, reward, claimState: "none", claimable: true, note: "" };
  });
}

/**
 * 把某天的返利发到站内信。
 *
 * 发放位先写 `reward_claim`（唯一索引挡重复点击），实际到账发生在用户点站内信领取时；
 * 发信失败把发放位删掉，用户还能重试，不会出现「活动页说已发、站内信里没有」。
 */
export async function issueCashbackReward(
  userId: string,
  date: string,
  s: CashbackSettings,
): Promise<{ state: RewardClaimState; consumed: number; reward: number }> {
  if (!s.enabled) throw new Error("消费返利活动未开启");

  const today = cnDateString();
  const earliest = shiftDateString(today, -s.backfillDays);
  if (date >= today || date < earliest) throw new Error("该日期不在可发放范围内");

  const legacy = await db
    .select({ id: cashbackClaims.id })
    .from(cashbackClaims)
    .where(and(eq(cashbackClaims.userId, userId), eq(cashbackClaims.periodDate, date)))
    .limit(1);
  if (legacy[0]) throw new Error("这一天的返利已经领取过了");

  const existingMap = await listRewardClaims(userId, "cashback");
  const existing = existingMap.get(date);
  if (existing) {
    if (existing.claimedAt) throw new Error("这一天的返利已经领取过了");
    return { state: "sent", consumed: await consumedOnDay(userId, date), reward: existing.rewardCredits };
  }

  const consumed = await consumedOnDay(userId, date);
  const reward = rewardFor(consumed, s);
  if (reward <= 0) {
    throw new Error(`当日消费 ${round2(consumed).toFixed(2)} cr，未达起返门槛或返利为 0`);
  }

  const reserved = await reserveRewardClaim({
    userId,
    activityKind: "cashback",
    tierKey: date,
    rewardCredits: reward,
    validDays: s.validDays,
    topupType: CASHBACK_TOPUP_TYPE,
  });
  if (!reserved.fresh) return { state: "sent", consumed: round2(consumed), reward };

  try {
    const messageId = await sendMessage({
      userId,
      kind: "reward",
      title: `消费返利 · ${date}`,
      body: [
        `${date} 当日消费 ${round2(consumed).toFixed(2)} cr，可返 ${reward.toFixed(2)} cr。`,
        `奖励已发放到站内信，请在站内信领取；领取后进入临时余额，有效期 ${s.validDays} 天。`,
      ].join("\n"),
      attachment: {
        kind: "temp_credits",
        credits: reward,
        validDays: s.validDays,
        topupType: CASHBACK_TOPUP_TYPE,
        rewardClaimId: reserved.id,
        cashbackDate: date,
        consumedCredits: round2(consumed),
      },
    });
    await attachRewardMessage(reserved.id, messageId);
  } catch (err) {
    await discardRewardClaim(reserved.id);
    throw err;
  }

  return { state: "sent", consumed: round2(consumed), reward };
}

export interface ClaimedRow {
  periodDate: string;
  consumedCredits: number;
  rewardCredits: number;
  createdAt: Date | null;
}

export async function listMyClaims(userId: string, limit = 20): Promise<ClaimedRow[]> {
  const rows = await db
    .select()
    .from(cashbackClaims)
    .where(eq(cashbackClaims.userId, userId))
    .orderBy(desc(cashbackClaims.periodDate))
    .limit(limit);

  return rows.map((r) => ({
    periodDate: r.periodDate,
    consumedCredits: r.consumedCredits,
    rewardCredits: r.rewardCredits,
    createdAt: r.createdAt,
  }));
}

export interface LeaderboardRow {
  rank: number;
  label: string;
  credits: number;
  isSelf: boolean;
}

/** 冲榜窗口起点（北京时间口径），页面上的「本期用量」与排行榜必须同一个窗口。 */
export function leaderboardStartMs(s: CashbackSettings): number {
  return dayBounds(shiftDateString(cnDateString(), -s.leaderboardDays)).start;
}

/**
 * 用量冲榜：窗口内按用户汇总消耗。
 * D1 上 `ORDER BY` 聚合表达式或 SELECT 别名都会解析失败，所以 SQL 只 group，排序放 JS。
 */
export async function getUsageLeaderboard(
  s: CashbackSettings,
  selfUserId: string,
): Promise<LeaderboardRow[]> {
  const rows = await db
    .select({
      userId: usageLogs.userId,
      credits: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
    })
    .from(usageLogs)
    .where(gte(usageLogs.createdAt, new Date(leaderboardStartMs(s))))
    .groupBy(usageLogs.userId);

  const ranked = rows
    .filter((r) => Number(r.credits) > 0)
    .sort((a, b) => Number(b.credits) - Number(a.credits))
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