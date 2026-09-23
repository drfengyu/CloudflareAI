import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { batchRows, db } from "@/lib/db/d1-http";
import { lotteryDraws, lotteryTickets, users } from "@/lib/db/schema";
import { round2 } from "./prize-math";

/**
 * 活动记录读取层：用户侧逐次明细 + 管理侧收益聚合。
 *
 * 不新增账本表——买券的钱在 `lottery_ticket.priceCredits`、开奖的账在
 * `lottery_draw.deltaCredits`，两边已经逐笔记全了，这里只做只读聚合。
 * 券面值用相关子查询取（drizzle 的 leftJoin 在本仓有 bug，见 AGENTS.md）。
 */

/** 统计窗口：左闭右开 [start, end)，与用量看板同一口径，由页面算好传入。 */
export interface LotteryWindow {
  start: Date;
  end: Date;
}

/** `unknown` = 券行已被清理（用户注销级联删除），此时面值按 0 计。 */
export type TicketSourceLabel = "buy" | "gift" | "unknown";

/** 一注开奖的完整记录：抽奖结果 + 消耗掉的那张券的来源与面值。 */
export interface DrawRecord {
  id: string;
  userId: string;
  batchId: string;
  seq: number;
  ring: "inner" | "outer";
  label: string;
  multiplier: number | null;
  deltaCredits: number;
  baseCredits: number;
  createdAt: Date | null;
  ticketSource: TicketSourceLabel;
  ticketCredits: number;
}

/** 站点在这一注上的净收益：收下的券面 + 倒扣回收 − 发放的中奖。 */
export function drawNetCredits(
  record: Pick<DrawRecord, "ticketCredits" | "deltaCredits">,
): number {
  return round2(
    record.ticketCredits + Math.max(0, -record.deltaCredits) - Math.max(0, record.deltaCredits),
  );
}

/** 券面值：赠券记 0，所以赠送的抽奖对站点收入没有贡献，只算发奖成本。 */
const drawnTicketCredits = sql`COALESCE((SELECT ${lotteryTickets.priceCredits} FROM ${lotteryTickets} WHERE ${lotteryTickets.id} = ${lotteryDraws.ticketId}), 0)`;

const paidOutExpr = sql`COALESCE(SUM(CASE WHEN ${lotteryDraws.deltaCredits} > 0 THEN ${lotteryDraws.deltaCredits} ELSE 0 END), 0)`;
const clawedBackExpr = sql`COALESCE(SUM(CASE WHEN ${lotteryDraws.deltaCredits} < 0 THEN -${lotteryDraws.deltaCredits} ELSE 0 END), 0)`;
const outerHitsExpr = sql`COALESCE(SUM(CASE WHEN ${lotteryDraws.ring} = 'outer' THEN 1 ELSE 0 END), 0)`;
const ticketFaceExpr = sql`COALESCE(SUM(${drawnTicketCredits}), 0)`;
const netExpr = sql`(${ticketFaceExpr} + ${clawedBackExpr} - ${paidOutExpr})`;

function drawWindowCondition(win?: LotteryWindow) {
  return win
    ? and(gte(lotteryDraws.createdAt, win.start), lt(lotteryDraws.createdAt, win.end))
    : undefined;
}

/** 收益口径的公共形状：中奖/倒扣/券面/净收益，用户侧与管理侧共用。 */
export interface LotteryBalance {
  draws: number;
  outerHits: number;
  /** 发放给用户的 cr（正数）。 */
  paidOut: number;
  /** 从用户余额倒扣回来的 cr（正数）。 */
  clawedBack: number;
  /** 这些次开奖消耗掉的券面值合计（站点已收的钱）。 */
  ticketFace: number;
  /** 站点净收益 = 券面 + 回收 − 发放。 */
  net: number;
}

type BalanceRow = {
  draws: unknown;
  outerHits: unknown;
  paidOut: unknown;
  clawedBack: unknown;
  ticketFace: unknown;
};

function toBalance(row: BalanceRow | undefined): LotteryBalance {
  const paidOut = Number(row?.paidOut ?? 0);
  const clawedBack = Number(row?.clawedBack ?? 0);
  const ticketFace = Number(row?.ticketFace ?? 0);
  return {
    draws: Number(row?.draws ?? 0),
    outerHits: Number(row?.outerHits ?? 0),
    paidOut: round2(paidOut),
    clawedBack: round2(clawedBack),
    ticketFace: round2(ticketFace),
    net: round2(ticketFace + clawedBack - paidOut),
  };
}

/** 窗口内（可限定单个用户）的开奖收益汇总。 */
export async function lotteryBalance(
  opts: { win?: LotteryWindow; userId?: string } = {},
): Promise<LotteryBalance> {
  const win = drawWindowCondition(opts.win);
  const where = opts.userId ? and(win, eq(lotteryDraws.userId, opts.userId)) : win;

  const rows = await db
    .select({
      draws: sql<number>`COUNT(*)`,
      outerHits: outerHitsExpr,
      paidOut: paidOutExpr,
      clawedBack: clawedBackExpr,
      ticketFace: ticketFaceExpr,
    })
    .from(lotteryDraws)
    .where(where);

  return toBalance(rows[0]);
}

/** 聚合结果 + 谁、最后一次开奖在什么时候。 */
export interface LotteryUserBalance extends LotteryBalance {
  userId: string;
  lastDrawAt: Date | null;
}

/** 按用户聚合的开奖收益；净收益倒序，先看在站点上赚得最多的用户。 */
export async function lotteryBalanceByUser(win?: LotteryWindow): Promise<LotteryUserBalance[]> {
  const rows = await db
    .select({
      userId: lotteryDraws.userId,
      draws: sql<number>`COUNT(*)`,
      outerHits: outerHitsExpr,
      paidOut: paidOutExpr,
      clawedBack: clawedBackExpr,
      ticketFace: ticketFaceExpr,
      lastDrawAt: sql<number | null>`MAX(${lotteryDraws.createdAt})`,
    })
    .from(lotteryDraws)
    .where(drawWindowCondition(win))
    .groupBy(lotteryDraws.userId)
    .orderBy(desc(netExpr));

  return rows.map((row) => ({
    ...toBalance(row),
    userId: row.userId,
    lastDrawAt: row.lastDrawAt == null ? null : new Date(Number(row.lastDrawAt)),
  }));
}

/** 上面那份聚合行补上邮箱（管理侧主表要显示用户），同样是两次查询手动映射以避开 leftJoin。 */
export interface LotteryUserRecord extends LotteryUserBalance {
  email: string;
}

export async function lotteryUserRecords(win?: LotteryWindow): Promise<LotteryUserRecord[]> {
  const stats = await lotteryBalanceByUser(win);
  const userIds = stats.map((s) => s.userId);
  const userRows: { id: string; email: string | null }[] = [];
  // inArray 每个 id 占一个绑定参数，超过 100 个 D1 直接拒绝，所以分段查。
  for (const chunk of batchRows(userIds, 1)) {
    const part = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, chunk));
    userRows.push(...part);
  }
  const emailMap = new Map(userRows.map((u) => [u.id, u.email]));
  return stats.map((s) => ({
    ...s,
    email: emailMap.get(s.userId) ?? s.userId.slice(0, 8),
  }));
}

export interface LotteryTicketTotals {
  /** 窗口内买入的张数与收入（cr）。 */
  boughtTickets: number;
  boughtCredits: number;
  /** 窗口内买入、但还没开奖的张数与面值。 */
  unusedTickets: number;
  unusedCredits: number;
  /** 窗口内累抽档位赠送的张数。 */
  giftTickets: number;
}

/**
 * 券的购入侧统计。
 *
 * 净收益只按**已开奖**的券算，未开奖的券不在里面，所以这里单独给出余券面值，
 * 免得把「卖了券」和「开奖兑现了」混成一个数。
 */
export async function lotteryTicketTotals(
  win?: LotteryWindow,
  userId?: string,
): Promise<LotteryTicketTotals> {
  const where = and(
    win
      ? and(gte(lotteryTickets.createdAt, win.start), lt(lotteryTickets.createdAt, win.end))
      : undefined,
    userId ? eq(lotteryTickets.userId, userId) : undefined,
  );

  const rows = await db
    .select({
      boughtTickets: sql<number>`COALESCE(SUM(CASE WHEN ${lotteryTickets.source} = 'buy' THEN 1 ELSE 0 END), 0)`,
      boughtCredits: sql<number>`COALESCE(SUM(CASE WHEN ${lotteryTickets.source} = 'buy' THEN ${lotteryTickets.priceCredits} ELSE 0 END), 0)`,
      unusedTickets: sql<number>`COALESCE(SUM(CASE WHEN ${lotteryTickets.source} = 'buy' AND ${lotteryTickets.usedDrawId} IS NULL THEN 1 ELSE 0 END), 0)`,
      unusedCredits: sql<number>`COALESCE(SUM(CASE WHEN ${lotteryTickets.source} = 'buy' AND ${lotteryTickets.usedDrawId} IS NULL THEN ${lotteryTickets.priceCredits} ELSE 0 END), 0)`,
      giftTickets: sql<number>`COALESCE(SUM(CASE WHEN ${lotteryTickets.source} = 'gift' THEN 1 ELSE 0 END), 0)`,
    })
    .from(lotteryTickets)
    .where(where);

  const row = rows[0];
  return {
    boughtTickets: Number(row?.boughtTickets ?? 0),
    boughtCredits: round2(Number(row?.boughtCredits ?? 0)),
    unusedTickets: Number(row?.unusedTickets ?? 0),
    unusedCredits: round2(Number(row?.unusedCredits ?? 0)),
    giftTickets: Number(row?.giftTickets ?? 0),
  };
}

/** 逐次明细：用户侧「我的活动记录」与管理侧「最近开奖」共用。 */
export async function listDrawRecords(opts: {
  win?: LotteryWindow;
  userId?: string;
  limit?: number;
}): Promise<DrawRecord[]> {
  const win = drawWindowCondition(opts.win);
  const where = opts.userId ? and(win, eq(lotteryDraws.userId, opts.userId)) : win;

  const rows = await db
    .select({
      id: lotteryDraws.id,
      userId: lotteryDraws.userId,
      batchId: lotteryDraws.batchId,
      seq: lotteryDraws.seq,
      ring: lotteryDraws.ring,
      label: lotteryDraws.label,
      multiplier: lotteryDraws.multiplier,
      deltaCredits: lotteryDraws.deltaCredits,
      baseCredits: lotteryDraws.baseCredits,
      createdAt: lotteryDraws.createdAt,
      ticketId: lotteryDraws.ticketId,
    })
    .from(lotteryDraws)
    .where(where)
    .orderBy(desc(lotteryDraws.createdAt), desc(lotteryDraws.seq))
    .limit(opts.limit ?? 50);

  const ticketIds = [...new Set(rows.map((r) => r.ticketId).filter((id): id is string => !!id))];
  const ticketRows: { id: string; source: "buy" | "gift"; priceCredits: number }[] = [];
  for (const chunk of batchRows(ticketIds, 1)) {
    const part = await db
      .select({
        id: lotteryTickets.id,
        source: lotteryTickets.source,
        priceCredits: lotteryTickets.priceCredits,
      })
      .from(lotteryTickets)
      .where(inArray(lotteryTickets.id, chunk));
    ticketRows.push(...part);
  }
  const ticketMap = new Map(ticketRows.map((t) => [t.id, t]));

  return rows.map((row) => {
    const ticket = row.ticketId ? ticketMap.get(row.ticketId) : undefined;
    return {
      id: row.id,
      userId: row.userId,
      batchId: row.batchId,
      seq: row.seq,
      ring: row.ring,
      label: row.label,
      multiplier: row.multiplier,
      deltaCredits: Number(row.deltaCredits),
      baseCredits: Number(row.baseCredits),
      createdAt: row.createdAt,
      ticketSource: ticket?.source ?? "unknown",
      ticketCredits: Number(ticket?.priceCredits ?? 0),
    };
  });
}
