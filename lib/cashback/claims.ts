import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/d1-http";
import { cashbackClaims, temporaryBalances, topups, usageLogs, users } from "@/lib/db/schema";
import { cnDateString, parseCnWallClock, shiftDateString } from "@/lib/date";
import { maskUserLabel } from "@/lib/mask";
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

  const claimedRows = await db
    .select({ periodDate: cashbackClaims.periodDate })
    .from(cashbackClaims)
    .where(and(eq(cashbackClaims.userId, userId), inArray(cashbackClaims.periodDate, dates)));
  const claimed = new Set(claimedRows.map((r) => r.periodDate));

  const days = await Promise.all(dates.map(async (date) => ({ date, consumed: await consumedOnDay(userId, date) })));

  return days.map(({ date, consumed }) => {
    const reward = rewardFor(consumed, s);
    if (claimed.has(date)) return { date, consumed, reward, claimable: false, note: "已领取" };
    if (!s.enabled) return { date, consumed, reward, claimable: false, note: "活动未开启" };
    if (reward <= 0) return { date, consumed, reward, claimable: false, note: "未达起返门槛" };
    return { date, consumed, reward, claimable: true, note: "" };
  });
}

/**
 * 领取某天的返利。三条写没有事务（D1 不支持），所以先插 `cashback_claim` 占住唯一索引，
 * 发放失败再把这条删掉——反过来先发光，重复点击就会真发双份。
 */
export async function claimCashback(
  userId: string,
  date: string,
  s: CashbackSettings,
): Promise<{ consumed: number; reward: number }> {
  if (!s.enabled) throw new Error("消费返利活动未开启");

  const today = cnDateString();
  const earliest = shiftDateString(today, -s.backfillDays);
  if (date >= today || date < earliest) throw new Error("该日期不在可领取范围内");

  const consumed = await consumedOnDay(userId, date);
  const reward = rewardFor(consumed, s);
  if (reward <= 0) throw new Error(`当日消费 ${consumed.toFixed(2)} cr，未达起返门槛或返利为 0`);

  const now = new Date();
  const claimId = crypto.randomUUID();
  await db.insert(cashbackClaims).values({
    id: claimId,
    userId,
    periodDate: date,
    consumedCredits: round2(consumed),
    rewardCredits: reward,
    createdAt: now,
  });

  const expiresAt = new Date(Date.now() + s.validDays * DAY_MS);
  const label = `${date} 消费 ${round2(consumed).toFixed(2)} cr`;
  try {
    await db.insert(temporaryBalances).values({
      id: crypto.randomUUID(),
      userId,
      amount: reward,
      expiresAt,
      description: `消费返利 ${reward.toFixed(2)} cr（${label}，有效期 ${s.validDays} 天）`,
      createdAt: now,
    });
    await db.insert(topups).values({
      id: crypto.randomUUID(),
      userId,
      amount: reward,
      type: CASHBACK_TOPUP_TYPE,
      description: `消费返利 ${reward.toFixed(2)} cr（${label}，有效期至 ${expiresAt.toLocaleDateString("zh-CN")}）`,
      createdAt: now,
    });
  } catch (err) {
    // 发钱没写成功就把占位删掉，否则这一天被唯一索引永久挡住，用户再也领不了。
    await db.delete(cashbackClaims).where(eq(cashbackClaims.id, claimId)).catch(() => undefined);
    throw err;
  }

  return { consumed: round2(consumed), reward };
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
