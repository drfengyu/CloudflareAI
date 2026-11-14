import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/d1-http";
import { flipRounds } from "@/lib/db/schema";
import { round2 } from "./config";

/**
 * 翻牌夺宝的读侧聚合：个人活动汇总与全站热度。
 *
 * 用户页不再展示逐局牌局明细，这里只保留按活动轮次聚合的数字。
 */

export interface FlipSummary {
  rounds: number;
  spent: number;
  /** 发到 tcr 余额的总额；券奖不计入。 */
  won: number;
  /** 券奖实发的整张数合计。 */
  wonTickets: number;
  /** tcr 奖里的最好一张（cr）；券奖不计入。 */
  best: number;
  /** 券奖里的最好一张：实发张数与当时的 cr 面值；0 = 没中过券奖。 */
  bestTickets: number;
  bestTicketCredits: number;
  /** 空牌局数：票价付了却什么没中。 */
  blanks: number;
}

/** 本活动轮次的个人汇总，一条聚合拿齐。 */
export async function flipSummary(userId: string, activityKey: string | null): Promise<FlipSummary> {
  if (!activityKey) {
    return { rounds: 0, spent: 0, won: 0, wonTickets: 0, best: 0, bestTickets: 0, bestTicketCredits: 0, blanks: 0 };
  }
  const rows = await db
    .select({
      rounds: sql<number>`COUNT(*)`,
      spent: sql<number>`COALESCE(SUM(${flipRounds.priceCredits}), 0)`,
      won: sql<number>`COALESCE(SUM(CASE WHEN ${flipRounds.rewardTickets} IS NULL THEN ${flipRounds.rewardCredits} ELSE 0 END), 0)`,
      wonTickets: sql<number>`COALESCE(SUM(${flipRounds.rewardTickets}), 0)`,
      best: sql<number>`COALESCE(MAX(CASE WHEN ${flipRounds.rewardTickets} IS NULL THEN ${flipRounds.rewardCredits} ELSE 0 END), 0)`,
      bestTickets: sql<number>`COALESCE(MAX(${flipRounds.rewardTickets}), 0)`,
      bestTicketCredits: sql<number>`COALESCE(MAX(CASE WHEN ${flipRounds.rewardTickets} IS NOT NULL THEN ${flipRounds.rewardCredits} ELSE 0 END), 0)`,
      blanks: sql<number>`COALESCE(SUM(CASE WHEN ${flipRounds.rewardCredits} = 0 THEN 1 ELSE 0 END), 0)`,
    })
    .from(flipRounds)
    .where(and(eq(flipRounds.userId, userId), eq(flipRounds.activityKey, activityKey)));
  const row = rows[0];
  return {
    rounds: Number(row?.rounds ?? 0),
    spent: round2(Number(row?.spent ?? 0)),
    won: round2(Number(row?.won ?? 0)),
    wonTickets: Number(row?.wonTickets ?? 0),
    best: round2(Number(row?.best ?? 0)),
    bestTickets: Number(row?.bestTickets ?? 0),
    bestTicketCredits: round2(Number(row?.bestTicketCredits ?? 0)),
    blanks: Number(row?.blanks ?? 0),
  };
}

export interface FlipGlobalStats {
  totalRounds: number;
  players: number;
  paidOut: number;
}

/** 全站口径的活动热度，放在活动页底部当参照。 */
export async function flipGlobalStats(activityKey: string | null): Promise<FlipGlobalStats> {
  if (!activityKey) return { totalRounds: 0, players: 0, paidOut: 0 };
  const rows = await db
    .select({
      totalRounds: sql<number>`COUNT(*)`,
      players: sql<number>`COUNT(DISTINCT ${flipRounds.userId})`,
      paidOut: sql<number>`COALESCE(SUM(${flipRounds.rewardCredits}), 0)`,
    })
    .from(flipRounds)
    .where(eq(flipRounds.activityKey, activityKey));
  const row = rows[0];
  return {
    totalRounds: Number(row?.totalRounds ?? 0),
    players: Number(row?.players ?? 0),
    paidOut: round2(Number(row?.paidOut ?? 0)),
  };
}
