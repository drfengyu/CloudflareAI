import { and, desc, eq, gt, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db/d1-http";
import { couponPackPurchases, lotteryDraws, lotteryTickets, lotteryUserStats, users } from "@/lib/db/schema";
import { cnLastNDaysStart, cnStartOfToday, cnStartOfTomorrow } from "@/lib/date";
import { maskUserLabel } from "@/lib/mask";
import { round2 } from "./prize-math";
import { LOTTERY_STATS_ALL_SCOPE } from "./stats";

/**
 * 转盘记录读取层：收益聚合、用户统计与大奖播报。
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

/**
 * 券面值：优先取开奖行自带的 ticketCredits（活动券直付记单券价、免费抽记 0）；
 * 历史行该列为 null，退回关联的 lottery_ticket.priceCredits；再没有就按 0。
 */
const drawnTicketCredits = sql`COALESCE(${lotteryDraws.ticketCredits}, (SELECT ${lotteryTickets.priceCredits} FROM ${lotteryTickets} WHERE ${lotteryTickets.id} = ${lotteryDraws.ticketId}), 0)`;

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

/**
 * 转盘活动券礼包的让利总额（cr）= Σ(到账券面 − 实付)。
 *
 * 礼包按倍率把券面打折卖给用户：让掉的这部分既是**站点亏损**也是**用户获利**，
 * 与开奖净收益（lotteryBalance.net）分开列，不混进余额账。按活动种类 'lottery' 过滤，
 * 带时间窗时只统计窗口内成交的礼包；不限时间则全量。
 */
export async function lotteryPackDiscount(win?: LotteryWindow): Promise<number> {
  const rows = await db
    .select({
      discount: sql<number>`COALESCE(SUM(${couponPackPurchases.couponCredits} - ${couponPackPurchases.priceCredits}), 0)`,
    })
    .from(couponPackPurchases)
    .where(
      and(
        eq(couponPackPurchases.activityKind, "lottery"),
        win ? gte(couponPackPurchases.createdAt, win.start) : undefined,
        win ? lt(couponPackPurchases.createdAt, win.end) : undefined,
      ),
    );
  return round2(Number(rows[0]?.discount ?? 0));
}

/** 后台时间窗按北京时间算，与用量看板一致；「全部」即不加过滤。 */
export function rangeWindow(range: string): LotteryWindow | undefined {
  const end = cnStartOfTomorrow();
  if (range === "today") return { start: cnStartOfToday(), end };
  if (range === "7d") return { start: cnLastNDaysStart(7), end };
  if (range === "30d") return { start: cnLastNDaysStart(30), end };
  return undefined;
}

/** 一条大奖播报记录。 */
export interface BigWinRecord {
  id: string;
  /** 脱敏后的用户标识（邮箱前缀首字符 + *** + 域名，或用户 ID 前 8 位）。 */
  userLabel: string;
  /** 奖品文案，如 `+1200 cr` 或 `+3 张活动券`。 */
  label: string;
  /** 中奖 cr 金额（赠券档为 0）。 */
  credits: number;
  /** 抽中的赠券档抽奖等价张数（展示时按券价折算成活动券）。 */
  grantTickets: number;
  createdAt: Date | null;
}

/**
 * 最近 N 小时内的大奖播报：deltaCredits >= threshold 或 grantTickets >= ticketThreshold。
 * 用于活动页底部的中奖墙，社会化证明「真的能中大奖」。
 * 用户邮箱脱敏：保留首字符 + *** + @域名；无邮箱时用用户 ID 前 8 位。
 *
 * 中奖墙对实时性无要求，同参数 60 秒内复用结果——`since` 随缓存重建才重算，
 * 免得每次打开活动页都扫一遍近 24h 的开奖明细。
 */
const getCachedRecentBigWins = unstable_cache(
  async (thresholdCredits: number, thresholdTickets: number, hours: number, limit: number) => {
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
        // unstable_cache 用 JSON 序列化，Date 会变字符串；这里先存毫秒数，取回再还原。
        createdAt: row.createdAt ? row.createdAt.getTime() : null,
      };
    });
  },
  ["lottery-big-wins"],
  { revalidate: 60 },
);

export async function listRecentBigWins(opts: {
  thresholdCredits?: number;
  thresholdTickets?: number;
  hours?: number;
  limit?: number;
}): Promise<BigWinRecord[]> {
  const cached = await getCachedRecentBigWins(
    opts.thresholdCredits ?? 500,
    opts.thresholdTickets ?? 3,
    opts.hours ?? 24,
    opts.limit ?? 30,
  );

  return cached.map((row) => ({
    ...row,
    createdAt: row.createdAt === null ? null : new Date(row.createdAt),
  }));
}
