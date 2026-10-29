import { and, desc, eq, gt, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { batchRows, db } from "@/lib/db/d1-http";
import { lotteryDraws, lotteryTickets, lotteryUserStats, users } from "@/lib/db/schema";
import { round2 } from "./prize-math";
import { LOTTERY_STATS_ALL_SCOPE } from "./stats";

/**
 * 活动记录读取层：用户侧逐次明细 + 管理侧收益聚合。
 *
 * 不新增账本表——买券的钱在 `lottery_ticket.priceCredits`、开奖的账在
 * `lottery_draw.deltaCredits`，两边已经逐笔记全了，这里只做读取。
 *
 * 2026-10-29：**不限时间**的汇总改读 `lottery_user_stats` 的累计行（开奖/买券时增量维护），
 * 不再扫整表；带时间窗的管理端口径仍然回到明细聚合，由 createdAt / (userId, createdAt)
 * 索引把读取限制在窗口内。券面值用相关子查询取（drizzle 的 leftJoin 在本仓有 bug）。
 */

/** 统计窗口：左闭右开 [start, end)，与用量看板同一口径，由页面算好传入。 */
export interface LotteryWindow {
  start: Date;
  end: Date;
}

/** `unknown` = 券行已被清理（用户注销级联删除），此时面值按 0 计；`free` = 每日免费抽（ticketId 为 null）。 */
export type TicketSourceLabel = "buy" | "gift" | "prize" | "free" | "unknown";

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
  /** 这一注抽中的抽奖券张数（外圈赠券档）；不进 cr 账本。 */
  grantTickets: number;
  createdAt: Date | null;
  ticketSource: TicketSourceLabel;
  ticketCredits: number;
  /** 活动轮次标识（startAt 字符串）；历史数据为 null。 */
  activityKey: string | null;
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

/** 窗口内（可限定单个用户、活动轮次）的开奖收益汇总。 */
export async function lotteryBalance(
  opts: { win?: LotteryWindow; userId?: string; activityKey?: string | null } = {},
): Promise<LotteryBalance> {
  // 带时间窗，或显式查「活动上线前的 null 轮次」：走明细聚合。
  if (opts.win || opts.activityKey === null) return balanceFromDraws(opts);

  const scope = opts.activityKey ?? LOTTERY_STATS_ALL_SCOPE;

  if (opts.userId) {
    const rows = await db
      .select({
        draws: lotteryUserStats.draws,
        outerHits: lotteryUserStats.outerHits,
        paidOut: lotteryUserStats.paidOut,
        clawedBack: lotteryUserStats.clawedBack,
        ticketFace: lotteryUserStats.ticketFace,
      })
      .from(lotteryUserStats)
      .where(and(eq(lotteryUserStats.userId, opts.userId), eq(lotteryUserStats.scope, scope)))
      .limit(1);
    return toBalance(rows[0]);
  }

  // 全站「全部」：每用户一行，用户数远小于开奖行数。
  const rows = await db
    .select({
      draws: sql<number>`COALESCE(SUM(${lotteryUserStats.draws}), 0)`,
      outerHits: sql<number>`COALESCE(SUM(${lotteryUserStats.outerHits}), 0)`,
      paidOut: sql<number>`COALESCE(SUM(${lotteryUserStats.paidOut}), 0)`,
      clawedBack: sql<number>`COALESCE(SUM(${lotteryUserStats.clawedBack}), 0)`,
      ticketFace: sql<number>`COALESCE(SUM(${lotteryUserStats.ticketFace}), 0)`,
    })
    .from(lotteryUserStats)
    .where(eq(lotteryUserStats.scope, scope));
  return toBalance(rows[0]);
}

/** 明细聚合：只在带时间窗 / 历史 null 轮次时使用，2026-10-29 之前是唯一路径。 */
async function balanceFromDraws(
  opts: { win?: LotteryWindow; userId?: string; activityKey?: string | null },
): Promise<LotteryBalance> {
  const win = drawWindowCondition(opts.win);
  const activityCond =
    opts.activityKey !== undefined
      ? opts.activityKey === null
        ? isNull(lotteryDraws.activityKey)
        : eq(lotteryDraws.activityKey, opts.activityKey)
      : undefined;
  const where = opts.userId
    ? and(win, activityCond, eq(lotteryDraws.userId, opts.userId))
    : and(win, activityCond);

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
  if (!win) {
    // 「全部」口径直接读累计行：每用户一行，不再扫整张开奖表。
    const rows = await db
      .select({
        userId: lotteryUserStats.userId,
        draws: lotteryUserStats.draws,
        outerHits: lotteryUserStats.outerHits,
        paidOut: lotteryUserStats.paidOut,
        clawedBack: lotteryUserStats.clawedBack,
        ticketFace: lotteryUserStats.ticketFace,
        lastDrawAt: lotteryUserStats.lastDrawAt,
      })
      .from(lotteryUserStats)
      .where(and(eq(lotteryUserStats.scope, LOTTERY_STATS_ALL_SCOPE), gt(lotteryUserStats.draws, 0)));
    return rows
      .map((row) => ({
        ...toBalance(row),
        userId: row.userId,
        lastDrawAt: row.lastDrawAt == null ? null : new Date(Number(row.lastDrawAt)),
      }))
      .sort((a, b) => b.net - a.net);
  }

  // 2026-10-28 修复：不把排序交给 SQL——ORDER BY 聚合表达式（含相关子查询）在 D1 上
  // 解析失败；引用 SELECT 别名也不行，drizzle 的 sql 字段不输出 AS。分组结果很小，
  // 在 JS 侧按净收益排序。
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
    .groupBy(lotteryDraws.userId);

  return rows
    .map((row) => ({
      ...toBalance(row),
      userId: row.userId,
      lastDrawAt: row.lastDrawAt == null ? null : new Date(Number(row.lastDrawAt)),
    }))
    .sort((a, b) => b.net - a.net);
}

/** 上面那份聚合行补上邮箱（管理侧主表要显示用户），同样是两次查询手动映射以避开 leftJoin。 */
export interface LotteryUserRecord extends LotteryUserBalance {
  email: string;
}

export async function lotteryUserRecords(win?: LotteryWindow): Promise<LotteryUserRecord[]> {
  const stats = await lotteryBalanceByUser(win);
  const userIds = stats.map((s) => s.userId);
  // 2026-10-23 性能：批量查询所有 userId，不再逐个查（N+1 → 1 次查询）。
  const userRows: { id: string; email: string | null }[] =
    userIds.length > 0
      ? await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
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
  /** 窗口内从奖池抽中的赠券张数（未开奖时它是站点对用户的欠账）。 */
  prizeTickets: number;
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
  // 不限时间：读累计行（单用户一行 / 全站按用户数求和），不再扫券表。
  if (!win) return ticketTotalsFromStats(userId);

  const where = and(
    gte(lotteryTickets.createdAt, win.start),
    lt(lotteryTickets.createdAt, win.end),
    userId ? eq(lotteryTickets.userId, userId) : undefined,
  );

  const rows = await db
    .select({
      boughtTickets: sql<number>`COALESCE(SUM(CASE WHEN ${lotteryTickets.source} = 'buy' THEN 1 ELSE 0 END), 0)`,
      boughtCredits: sql<number>`COALESCE(SUM(CASE WHEN ${lotteryTickets.source} = 'buy' THEN ${lotteryTickets.priceCredits} ELSE 0 END), 0)`,
      unusedTickets: sql<number>`COALESCE(SUM(CASE WHEN ${lotteryTickets.source} = 'buy' AND ${lotteryTickets.usedDrawId} IS NULL THEN 1 ELSE 0 END), 0)`,
      unusedCredits: sql<number>`COALESCE(SUM(CASE WHEN ${lotteryTickets.source} = 'buy' AND ${lotteryTickets.usedDrawId} IS NULL THEN ${lotteryTickets.priceCredits} ELSE 0 END), 0)`,
      giftTickets: sql<number>`COALESCE(SUM(CASE WHEN ${lotteryTickets.source} = 'gift' THEN 1 ELSE 0 END), 0)`,
      prizeTickets: sql<number>`COALESCE(SUM(CASE WHEN ${lotteryTickets.source} = 'prize' THEN 1 ELSE 0 END), 0)`,
    })
    .from(lotteryTickets)
    .where(where);

  return toTicketTotals(rows[0]);
}

/** 累计行版本：券侧计数只维护全量口径（scope='all'）。 */
async function ticketTotalsFromStats(userId?: string): Promise<LotteryTicketTotals> {
  if (userId) {
    const rows = await db
      .select({
        boughtTickets: lotteryUserStats.boughtTickets,
        boughtCredits: lotteryUserStats.boughtCredits,
        unusedTickets: lotteryUserStats.unusedTickets,
        unusedCredits: lotteryUserStats.unusedCredits,
        giftTickets: lotteryUserStats.giftTickets,
        prizeTickets: lotteryUserStats.prizeTickets,
      })
      .from(lotteryUserStats)
      .where(
        and(
          eq(lotteryUserStats.userId, userId),
          eq(lotteryUserStats.scope, LOTTERY_STATS_ALL_SCOPE),
        ),
      )
      .limit(1);
    return toTicketTotals(rows[0]);
  }

  const rows = await db
    .select({
      boughtTickets: sql<number>`COALESCE(SUM(${lotteryUserStats.boughtTickets}), 0)`,
      boughtCredits: sql<number>`COALESCE(SUM(${lotteryUserStats.boughtCredits}), 0)`,
      unusedTickets: sql<number>`COALESCE(SUM(${lotteryUserStats.unusedTickets}), 0)`,
      unusedCredits: sql<number>`COALESCE(SUM(${lotteryUserStats.unusedCredits}), 0)`,
      giftTickets: sql<number>`COALESCE(SUM(${lotteryUserStats.giftTickets}), 0)`,
      prizeTickets: sql<number>`COALESCE(SUM(${lotteryUserStats.prizeTickets}), 0)`,
    })
    .from(lotteryUserStats)
    .where(eq(lotteryUserStats.scope, LOTTERY_STATS_ALL_SCOPE));
  return toTicketTotals(rows[0]);
}

type TicketTotalsRow = {
  boughtTickets?: unknown;
  boughtCredits?: unknown;
  unusedTickets?: unknown;
  unusedCredits?: unknown;
  giftTickets?: unknown;
  prizeTickets?: unknown;
};

function toTicketTotals(row: TicketTotalsRow | undefined): LotteryTicketTotals {
  return {
    boughtTickets: Number(row?.boughtTickets ?? 0),
    boughtCredits: round2(Number(row?.boughtCredits ?? 0)),
    unusedTickets: Number(row?.unusedTickets ?? 0),
    unusedCredits: round2(Number(row?.unusedCredits ?? 0)),
    giftTickets: Number(row?.giftTickets ?? 0),
    prizeTickets: Number(row?.prizeTickets ?? 0),
  };
}

/** 逐次明细：用户侧「我的活动记录」与管理侧「最近开奖」共用。 */
export async function listDrawRecords(opts: {
  win?: LotteryWindow;
  userId?: string;
  activityKey?: string | null;
  limit?: number;
}): Promise<DrawRecord[]> {
  const win = drawWindowCondition(opts.win);
  const activityCond =
    opts.activityKey !== undefined
      ? opts.activityKey === null
        ? isNull(lotteryDraws.activityKey)
        : eq(lotteryDraws.activityKey, opts.activityKey)
      : undefined;
  const where = and(
    win,
    activityCond,
    opts.userId ? eq(lotteryDraws.userId, opts.userId) : undefined,
  );

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
      grantTickets: lotteryDraws.grantTickets,
      createdAt: lotteryDraws.createdAt,
      ticketId: lotteryDraws.ticketId,
      activityKey: lotteryDraws.activityKey,
    })
    .from(lotteryDraws)
    .where(where)
    .orderBy(desc(lotteryDraws.createdAt), desc(lotteryDraws.seq))
    .limit(opts.limit ?? 50);

  const ticketIds = [...new Set(rows.map((r) => r.ticketId).filter((id): id is string => !!id))];
  // 2026-10-28 修复：管理侧一次取 200 条明细，inArray 最多可到 200 个 id；
  // D1 每条语句最多 100 个绑定参数，必须分段查（batchRows(ids, 1) 即每段 100 个）。
  const ticketMap = new Map<
    string,
    { id: string; source: "buy" | "gift" | "prize"; priceCredits: number }
  >();
  for (const chunk of batchRows(ticketIds, 1)) {
    const part = await db
      .select({
        id: lotteryTickets.id,
        source: lotteryTickets.source,
        priceCredits: lotteryTickets.priceCredits,
      })
      .from(lotteryTickets)
      .where(inArray(lotteryTickets.id, chunk));
    for (const t of part) ticketMap.set(t.id, t);
  }

  return rows.map((row) => {
    const ticket = row.ticketId ? ticketMap.get(row.ticketId) : undefined;
    // ticketId 为 null 是每日免费抽；有 id 但查不到券行是用户注销级联删除。
    const source: TicketSourceLabel = !row.ticketId ? "free" : ticket?.source ?? "unknown";
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
      grantTickets: Number(row.grantTickets ?? 0),
      createdAt: row.createdAt,
      ticketSource: source,
      ticketCredits: Number(ticket?.priceCredits ?? 0),
      activityKey: row.activityKey,
    };
  });
}

/** 一条大奖播报记录。 */
export interface BigWinRecord {
  id: string;
  /** 脱敏后的用户标识（邮箱前缀首字符 + *** + 域名，或用户 ID 前 8 位）。 */
  userLabel: string;
  /** 奖品文案，如 `+1200 cr` 或 `+3 张券`。 */
  label: string;
  /** 中奖 cr 金额（赠券档为 0）。 */
  credits: number;
  /** 抽中的赠券张数。 */
  grantTickets: number;
  createdAt: Date | null;
}

/**
 * 最近 N 小时内的大奖播报：deltaCredits >= threshold 或 grantTickets >= ticketThreshold。
 * 用于活动页底部的中奖墙，社会化证明「真的能中大奖」。
 * 用户邮箱脱敏：保留首字符 + *** + @域名；无邮箱时用用户 ID 前 8 位。
 */
export async function listRecentBigWins(opts: {
  thresholdCredits?: number;
  thresholdTickets?: number;
  hours?: number;
  limit?: number;
}): Promise<BigWinRecord[]> {
  const thresholdCredits = opts.thresholdCredits ?? 500;
  const thresholdTickets = opts.thresholdTickets ?? 3;
  const hours = opts.hours ?? 24;
  const limit = opts.limit ?? 30;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: lotteryDraws.id,
      userId: lotteryDraws.userId,
      label: lotteryDraws.label,
      deltaCredits: lotteryDraws.deltaCredits,
      grantTickets: lotteryDraws.grantTickets,
      createdAt: lotteryDraws.createdAt,
    })
    .from(lotteryDraws)
    .where(
      and(
        gte(lotteryDraws.createdAt, since),
        sql`(${lotteryDraws.deltaCredits} >= ${thresholdCredits} OR ${lotteryDraws.grantTickets} >= ${thresholdTickets})`,
      ),
    )
    .orderBy(desc(lotteryDraws.createdAt), desc(lotteryDraws.seq))
    .limit(limit);

  // 不用 leftJoin（drizzle-orm v0.45.2 字段错位 bug），单独查用户再手动映射。
  // 2026-10-23 性能：批量查询所有 userId，不再逐个查（N+1 → 1 次查询）。
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const userRows: { id: string; email: string | null; name: string | null }[] =
    userIds.length > 0
      ? await db
          .select({ id: users.id, email: users.email, name: users.name })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  return rows.map((row) => {
    const user = userMap.get(row.userId);
    return {
      id: row.id,
      userLabel: maskUserLabel(user?.email ?? null, user?.name ?? null, row.userId),
      label: row.label,
      credits: Number(row.deltaCredits),
      grantTickets: Number(row.grantTickets ?? 0),
      createdAt: row.createdAt,
    };
  });
}

/** 脱敏用户标识：邮箱首字符 + *** + 域名；无邮箱用昵称；都没有用用户 ID 前 8 位。 */
function maskUserLabel(email: string | null, name: string | null, userId: string): string {
  if (email) {
    const [local, domain] = email.split("@");
    if (local && domain) {
      return `${local.charAt(0)}***@${domain}`;
    }
  }
  if (name && name.trim()) {
    return name.trim().slice(0, 1) + "***";
  }
  return `用户${userId.slice(0, 8)}`;
}
