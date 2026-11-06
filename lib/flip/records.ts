import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/d1-http";
import { flipRounds, type FlipRound } from "@/lib/db/schema";
import { parseFlipBoard, round2 } from "./config";

/**
 * 翻牌夺宝的读侧聚合。
 *
 * 只有已完成的局才带牌桌：没翻开的局把 `board` 发给前端等于提前公布答案，
 * 所以这里一律返回 `board: null`，由界面画 12 张背面。
 */

export interface FlipRoundView {
  id: string;
  priceCredits: number;
  /** 翻开的位置（0 起）；未翻为 null。 */
  position: number | null;
  /** 实发 cr；未翻为 null（不是 0，界面据此区分「还没翻」和「翻了是空牌」）。 */
  reward: number | null;
  /** 已翻开才揭晓的牌桌。 */
  board: number[] | null;
  createdAt: Date;
}

function toRoundView(row: FlipRound): FlipRoundView {
  const settled = row.status === "settled";
  return {
    id: row.id,
    priceCredits: Number(row.priceCredits),
    position: settled ? (row.position ?? null) : null,
    reward: settled ? round2(Number(row.rewardCredits ?? 0)) : null,
    board: settled ? parseFlipBoard(row.board) : null,
    createdAt: new Date(row.createdAt ?? Date.now()),
  };
}

/** 我的牌局每页局数：首屏与卡片内局部翻页共用。 */
export const FLIP_ROUND_PAGE_SIZE = 10;

/** 本活动轮次的牌局明细，按翻页取。 */
export async function listMyRounds(
  userId: string,
  activityKey: string | null,
  limit = FLIP_ROUND_PAGE_SIZE,
  offset = 0,
): Promise<FlipRoundView[]> {
  // 活动没填开始时间时没有「当前轮次」这个口径可统计，历史局留在它自己那一轮里。
  if (!activityKey) return [];
  const rows = await db
    .select()
    .from(flipRounds)
    .where(and(eq(flipRounds.userId, userId), eq(flipRounds.activityKey, activityKey)))
    .orderBy(desc(flipRounds.createdAt))
    .limit(limit)
    .offset(offset);
  return rows.map((row) => toRoundView(row as FlipRound));
}

export interface FlipSummary {
  rounds: number;
  spent: number;
  won: number;
  /** 本活动内的最好一张牌（cr）。 */
  best: number;
  /** 空牌局数：票价付了却什么没中。 */
  blanks: number;
}

/** 本活动轮次的个人汇总，一条聚合拿齐。 */
export async function flipSummary(userId: string, activityKey: string | null): Promise<FlipSummary> {
  if (!activityKey) return { rounds: 0, spent: 0, won: 0, best: 0, blanks: 0 };
  const rows = await db
    .select({
      rounds: sql<number>`COUNT(*)`,
      spent: sql<number>`COALESCE(SUM(${flipRounds.priceCredits}), 0)`,
      won: sql<number>`COALESCE(SUM(${flipRounds.rewardCredits}), 0)`,
      best: sql<number>`COALESCE(MAX(${flipRounds.rewardCredits}), 0)`,
      blanks: sql<number>`COALESCE(SUM(CASE WHEN ${flipRounds.rewardCredits} = 0 THEN 1 ELSE 0 END), 0)`,
    })
    .from(flipRounds)
    .where(and(eq(flipRounds.userId, userId), eq(flipRounds.activityKey, activityKey)));
  const row = rows[0];
  return {
    rounds: Number(row?.rounds ?? 0),
    spent: round2(Number(row?.spent ?? 0)),
    won: round2(Number(row?.won ?? 0)),
    best: round2(Number(row?.best ?? 0)),
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
