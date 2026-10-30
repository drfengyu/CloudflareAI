import { and, asc, eq, gt, gte, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { batchRows, d1Run, db, D1_MAX_BINDINGS } from "@/lib/db/d1-http";
import {
  lotteryDraws,
  lotteryTickets,
  lotteryUserStats,
  temporaryBalances,
  topups,
  users,
} from "@/lib/db/schema";
import {
  LOTTERY_STATS_ALL_SCOPE,
  negateStatsDelta,
  type LotteryStatsDelta,
} from "./stats";

/**
 * 抽奖的账本原语。
 *
 * D1 经 REST 访问、没有事务，所以「扣了钱又开奖失败」这类半截状态只能靠条件更新 +
 * 显式回滚收口：每条 UPDATE 都自带前提（余额够 / 券还没被用过），用 `d1Run` 返回的
 * `changes` 判断有没有真的命中。
 *
 * 这里的写入一律**按整批设计**：一次 10 连抽原先要打约 40 次串行 HTTP 往返（单程
 * 实测 0.4~0.9 秒），所以锁券合成一条 CASE 更新、每一张表的行合成一条多行 INSERT、
 * 倒扣合成一次净额 UPDATE，剩下几个互不相关的语句并发发出。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DrawRow {
  id: string;
  ring: "inner" | "outer";
  label: string;
  multiplier: number | null;
  deltaCredits: number;
  createdAt: Date | null;
}

/** 可用券数量（未消耗且未过期）。 */
export async function countUnusedTickets(userId: string): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(lotteryTickets)
    .where(
      and(eq(lotteryTickets.userId, userId), isNull(lotteryTickets.usedDrawId), eq(lotteryTickets.expired, 0)),
    );
  return Number(rows[0]?.c ?? 0);
}

/**
 * 累计抽奖次数，累抽档位的判定依据。按活动轮次过滤，新活动战绩重计。
 *
 * 2026-10-29：改读 `lottery_user_stats` 的单行累计值——原先 COUNT(*) 要把该用户
 * 本轮的开奖记录全扫一遍，每抽一次都重复读。口径与之前的 COUNT 一致。
 */
export async function countDraws(userId: string, activityKey?: string | null): Promise<number> {
  const scope = activityKey || LOTTERY_STATS_ALL_SCOPE;
  const rows = await db
    .select({ draws: lotteryUserStats.draws })
    .from(lotteryUserStats)
    .where(and(eq(lotteryUserStats.userId, userId), eq(lotteryUserStats.scope, scope)))
    .limit(1);
  return Number(rows[0]?.draws ?? 0);
}

/**
 * 连续未中大奖次数：从最近一条开奖记录往前数，直到遇到一条「外圈正档」为止。
 *
 * 「中大奖」= ring=outer 且（deltaCredits > 0 或 grantTickets > 0），即外圈的正数 cr 档或赠券档。
 * 内圈全算未中，外圈倒扣（deltaCredits < 0）也算未中。
 * 用于保底机制：连续未中达到阈值后，下一次外圈概率临时提升。
 */
export async function countConsecutiveMisses(
  userId: string,
  lookback = 30,
  activityKey?: string | null,
): Promise<number> {
  const rows = await db
    .select({
      ring: lotteryDraws.ring,
      deltaCredits: lotteryDraws.deltaCredits,
      grantTickets: lotteryDraws.grantTickets,
    })
    .from(lotteryDraws)
    .where(
      and(
        eq(lotteryDraws.userId, userId),
        activityKey ? eq(lotteryDraws.activityKey, activityKey) : undefined,
      ),
    )
    .orderBy(sql`${lotteryDraws.createdAt} DESC`, sql`${lotteryDraws.seq} DESC`)
    .limit(lookback);

  let misses = 0;
  for (const row of rows) {
    const isBigWin = row.ring === "outer" && (Number(row.deltaCredits) > 0 || Number(row.grantTickets ?? 0) > 0);
    if (isBigWin) break;
    misses += 1;
  }
  return misses;
}

/** 最近的开奖明细。 */
export async function listRecentDraws(userId: string, limit = 20): Promise<DrawRow[]> {
  return db
    .select({
      id: lotteryDraws.id,
      ring: lotteryDraws.ring,
      label: lotteryDraws.label,
      multiplier: lotteryDraws.multiplier,
      deltaCredits: lotteryDraws.deltaCredits,
      createdAt: lotteryDraws.createdAt,
    })
    .from(lotteryDraws)
    .where(eq(lotteryDraws.userId, userId))
    .orderBy(sql`${lotteryDraws.createdAt} DESC`)
    .limit(limit);
}

/**
 * 北京日期键（"2026-10-17"）。免费抽的「今天」与 `lottery_draw.freeDrawDate` 都用它，
 * 所以判据不依赖服务器时区，也不依赖 `createdAt` 的毫秒落在哪个 UTC 日里。
 */
export function beijingDayKey(now = Date.now()): string {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 今日是否已用过免费抽。一条查询两种判据（少一次 D1 往返）：
 *
 * - `freeDrawDate = 今天`：迁移 012 起免费抽那行直接写当天日期，也是唯一索引挡住并发重复领的那一列。
 * - `ticketId IS NULL AND createdAt >= 今天 0 点`：迁移之前产生的记录没有 freeDrawDate，
 *   留着这条兜底，免得刚上线那天已经抽过的人又能白嫖一次。
 */
export async function hasUsedFreeDrawToday(
  userId: string,
  dayKey = beijingDayKey(),
): Promise<boolean> {
  // "2026-10-17" + 北京 00:00 → UTC 毫秒。
  const dayStartMs = Date.parse(`${dayKey}T00:00:00+08:00`);
  const rows = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(lotteryDraws)
    .where(
      and(
        eq(lotteryDraws.userId, userId),
        or(
          eq(lotteryDraws.freeDrawDate, dayKey),
          // createdAt 是 timestamp_ms 模式，比较值要传 Date（驱动自己折算成毫秒）。
          and(isNull(lotteryDraws.ticketId), gte(lotteryDraws.createdAt, new Date(dayStartMs))),
        ),
      ),
    );
  return Number(rows[0]?.c ?? 0) > 0;
}

/** 参与人数与总抽奖次数（活动页统计）。 */
export async function globalLotteryStats(): Promise<{ totalDraws: number; players: number }> {
  const [draws, players] = await Promise.all([
    db.select({ c: sql<number>`COUNT(*)` }).from(lotteryDraws),
    db.select({ c: sql<number>`COUNT(DISTINCT ${lotteryDraws.userId})` }).from(lotteryDraws),
  ]);
  return {
    totalDraws: Number(draws[0]?.c ?? 0),
    players: Number(players[0]?.c ?? 0),
  };
}

/** 取 n 张未消耗的券（最早发放的优先），带上面值与来源给统计口径用。 */
export interface UnusedTicketPick {
  id: string;
  source: "buy" | "gift" | "prize";
  priceCredits: number;
}

export async function pickUnusedTickets(userId: string, n: number): Promise<UnusedTicketPick[]> {
  const rows = await db
    .select({
      id: lotteryTickets.id,
      source: lotteryTickets.source,
      priceCredits: lotteryTickets.priceCredits,
    })
    .from(lotteryTickets)
    .where(
      and(
        eq(lotteryTickets.userId, userId),
        isNull(lotteryTickets.usedDrawId),
        eq(lotteryTickets.expired, 0),
      ),
    )
    .orderBy(asc(lotteryTickets.createdAt))
    .limit(n);
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    priceCredits: Number(r.priceCredits ?? 0),
  }));
}

/**
 * 把整批券一次锁给对应的开奖 id；false 表示其中至少一张已被并发请求用掉。
 *
 * 「有券被占用就一张都不锁」必须写进这条语句本身（末尾那个 COUNT 条件），不能靠调用方
 * 比较命中数再回滚：回滚是第二条语句，中间那一瞬并发请求能把刚锁上的券再偷走，
 * 用户白掉券。逐张锁还会多打 10 次 HTTP 往返。
 */
export async function lockTickets(ticketIds: string[], drawIds: string[]): Promise<boolean> {
  // 每张券绑 4 个参数（CASE 的 id 与目标 drawId、两处 IN 列表各一次），别超 D1 的参数墙。
  if (ticketIds.length * 4 + 1 > D1_MAX_BINDINGS) throw new Error("一次锁定的券过多");
  const cases = ticketIds.map(() => "WHEN ? THEN ?").join(" ");
  const placeholders = ticketIds.map(() => "?").join(", ");
  const idList = ticketIds.map(() => "?").join(", ");
  const params: unknown[] = [];
  ticketIds.forEach((ticketId, index) => params.push(ticketId, drawIds[index]));
  params.push(...ticketIds);
  params.push(...ticketIds);
  const { changes } = await d1Run(
    `UPDATE lottery_ticket SET usedDrawId = CASE id ${cases} END ` +
      `WHERE usedDrawId IS NULL AND id IN (${placeholders}) ` +
      `AND (SELECT COUNT(*) FROM lottery_ticket WHERE id IN (${idList}) AND usedDrawId IS NULL) = ?`,
    [...params, ticketIds.length],
  );
  return changes === ticketIds.length;
}

/** 整批退回券包（开奖失败或提前退出时把锁定释放掉）。 */
export async function unlockTickets(ticketIds: string[]): Promise<void> {
  for (const batch of batchRows(ticketIds, 1)) {
    await d1Run(
      `UPDATE lottery_ticket SET usedDrawId = NULL WHERE id IN (${batch.map(() => "?").join(",")})`,
      batch,
    );
  }
}

/** 发券；档位赠券带 `milestoneDraws` + 档位内序号，靠唯一索引保证同档位只发一次。 */
export async function grantTickets(
  userId: string,
  count: number,
  grant: {
    source: "buy" | "gift" | "prize";
    priceCredits?: number;
    milestoneDraws?: number;
    /** 活动轮次标识；null 表示历史数据或活动未启用。 */
    activityKey?: string | null;
  },
): Promise<string[]> {
  const ids: string[] = [];
  const values = Array.from({ length: count }, (_unused, index) => {
    const id = crypto.randomUUID();
    ids.push(id);
    return {
      id,
      userId,
      source: grant.source,
      priceCredits: grant.priceCredits ?? 0,
      milestoneDraws: grant.milestoneDraws ?? null,
      activityKey: grant.activityKey ?? null,
      // 一个档位送多张时，各行靠序号区分，否则第二行会撞 (userId, milestoneDraws) 唯一索引。
      milestoneSeq: grant.milestoneDraws === undefined ? 0 : index,
      createdAt: new Date(),
    };
  });
  // 每行绑 10 个参数（含 Drizzle 自动补的 usedDrawId、expired 默认值），一次买 50 张就是 500 个，会直接撞 D1 的参数墙，必须分片。
  // 多批并行插入，D1 HTTP API 无状态可并发，100 张券从串行 ~5 秒降到 ~1.5 秒。
  const batches = batchRows(values, 10);
  await Promise.all(batches.map((batch) => db.insert(lotteryTickets).values(batch)));
  return ids;
}

/** 金额按 1e-6 对齐，避免多次加减后留下浮点尾巴（0.1+0.2 那类）。 */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** 收回刚发出的券；发券之后还有步骤失败时用它把券清干净。 */
export async function deleteTickets(ids: string[]): Promise<void> {
  for (const batch of batchRows(ids, 1)) {
    await db.delete(lotteryTickets).where(inArray(lotteryTickets.id, batch));
  }
}


/**
 * 结算本批落到永久余额上的**正数**净额（目前只有「永久余额」奖型）。
 *
 * 倒扣不走这里：2026-10-17 起它先吃未过期的临时余额，剩下的才动本金，见 `clawbackCredits()`。
 * 这里仍是无条件加法/减法，本金可以被扣成负数——管理员 2026-10-17 明确定过：不给倒扣加下限，
 * 与消费侧 `deductCredits` 同口径。曾提过「最多扣到 0」，被他回退，别再往这个方向加东西。
 */
export async function adjustPermanentBalance(userId: string, delta: number): Promise<void> {
  await db
    .update(users)
    .set({ balanceCredits: sql`${users.balanceCredits} + ${delta}` })
    .where(eq(users.id, userId));
}

/** 一次倒扣实际扣了哪些地方，失败时按它原路退回。 */
export interface ClawbackReceipt {
  temp: {
    id: string;
    taken: number;
    /** 被扣空因而删掉的行；退回时按这份快照原样重建（id 都不变）。 */
    deletedRow?: (typeof temporaryBalances.$inferInsert & { id: string }) | null;
  }[];
  /** 临时余额不够、落到永久余额上的部分。 */
  permanent: number;
}

/**
 * 回收整批的倒扣：先扣未过期的临时余额（最早过期的先扣），不够再扣永久余额（允许扣成负数）。
 *
 * 2026-10-17 改口径。原先倒扣一步砸在永久余额上，于是出现「本金欠着 1,598.80 cr，
 * 手上却还躺着 2,051.39 cr 未过期的临时余额」这种分裂账户：站点没真的收回成本，
 * 那些赠送额度逐笔作废完，用户才发现可用余额从正翻负。
 * 现在跟买券、模型消费走同一优先级——先把快过期的赠送额度花掉，惩罚金额一分不少，只是少的是
 * 本来就要作废的那份钱。
 *
 * @param excludeIds 本批刚发出的中奖行。发奖与倒扣在同一次写入里并发进行，不排除掉会出现
 *                   「刚发给他的钱当场又被倒扣拿走」，账目也难核对。
 */
export async function clawbackCredits(
  userId: string,
  amount: number,
  excludeIds: string[] = [],
): Promise<ClawbackReceipt> {
  const receipt: ClawbackReceipt = { temp: [], permanent: 0 };
  let remaining = round6(amount);
  if (remaining <= 0) return receipt;

  const rows = await db
    .select()
    .from(temporaryBalances)
    .where(
      and(
        eq(temporaryBalances.userId, userId),
        // 必须用 gt()：expiresAt 存毫秒整数，raw sql 会把 Date 绑成 ISO 字符串，比较恒假。
        gt(temporaryBalances.expiresAt, new Date()),
        excludeIds.length ? notInArray(temporaryBalances.id, excludeIds) : undefined,
      ),
    )
    .orderBy(asc(temporaryBalances.expiresAt));

  for (const row of rows) {
    if (remaining <= 0) break;
    // 2026-10-17 修复：取整只能作用在「还欠多少」上，扣这一行时要照库里的原值扣。
    // 先减后 round 会把 0.3-0.1-0.1 剩下的 0.09999999999999998 抬成 0.1，比行内余额还大，
    // `amount >= ?` 恒假 → 这行被跳过、0.1 全落本金，而那丝尾巴留在即将过期的临时行里。
    const take = row.amount <= remaining ? row.amount : remaining;
    if (take <= 0) continue;
    const { changes } = await d1Run(
      "UPDATE temporary_balance SET amount = amount - ? WHERE id = ? AND amount >= ?",
      [take, row.id, take],
    );
    // changes=0 = 这一行被并发消费改走了，跳过它，钱留给下一行或本金，绝不超扣。
    if (changes !== 1) continue;
    receipt.temp.push({
      id: row.id,
      taken: take,
      deletedRow: take >= row.amount ? { ...row } : null,
    });
    remaining = round6(remaining - take);
  }

  if (remaining > 0) {
    await d1Run("UPDATE user SET balanceCredits = balanceCredits - ? WHERE id = ?", [
      remaining,
      userId,
    ]);
    receipt.permanent = remaining;
  }

  // 扣空的行删掉，跟 spendCredits 一致，免得钱包明细里躺一串 0 cr 条目。
  for (const hit of receipt.temp) {
    if (hit.deletedRow) await db.delete(temporaryBalances).where(eq(temporaryBalances.id, hit.id));
  }

  return receipt;
}

/** 按凭据退回一次倒扣（整批回滚用）。临时余额优先加回原行，行已经没了就按快照重建。 */
export async function refundClawback(userId: string, receipt: ClawbackReceipt): Promise<void> {
  for (const hit of receipt.temp) {
    const { changes } = await d1Run(
      "UPDATE temporary_balance SET amount = amount + ? WHERE id = ?",
      [hit.taken, hit.id],
    );
    if (changes !== 1 && hit.deletedRow) {
      const row = hit.deletedRow;
      await db
        .insert(temporaryBalances)
        .values({ id: row.id, userId, amount: row.amount, expiresAt: row.expiresAt, description: row.description });
    }
  }
  if (receipt.permanent !== 0) {
    await adjustPermanentBalance(userId, receipt.permanent);
  }
}

/** 造一笔带过期的中奖临时余额行；发奖走批量插入，所以这里只造行。 */
export function buildTemporaryPrizeRow(
  userId: string,
  amount: number,
  validDays: number,
  description: string,
): typeof temporaryBalances.$inferInsert {
  return {
    id: crypto.randomUUID(),
    userId,
    amount,
    expiresAt: new Date(Date.now() + Math.max(1, validDays) * DAY_MS),
    description,
    createdAt: new Date(),
  };
}

/**
 * 下面三个整批发奖各自一次往返，而不是逐注一写：一次 10 连抽原先要打 20~30 次串行
 * HTTP，D1 的延迟全摊在这里。
 */
export async function insertDrawRows(rows: (typeof lotteryDraws.$inferInsert)[]): Promise<void> {
  if (!rows.length) return;
  for (const batch of batchRows(rows, Object.keys(rows[0]).length)) {
    await db.insert(lotteryDraws).values(batch);
  }
}

export async function insertTopupRows(rows: (typeof topups.$inferInsert)[]): Promise<void> {
  if (!rows.length) return;
  for (const batch of batchRows(rows, Object.keys(rows[0]).length)) {
    await db.insert(topups).values(batch);
  }
}

/** 批量发中奖临时余额；每行的过期时间独立，所以不合并成一笔。 */
export async function insertTemporaryBalanceRows(
  rows: (typeof temporaryBalances.$inferInsert)[],
): Promise<void> {
  if (!rows.length) return;
  for (const batch of batchRows(rows, Object.keys(rows[0]).length)) {
    await db.insert(temporaryBalances).values(batch);
  }
}

/** 下面三个是整批撤销用的：回滚按 id 列表删，不依赖「哪一注成功过」。 */
export async function deleteDrawsByIds(ids: string[]): Promise<void> {
  for (const batch of batchRows(ids, 1)) {
    await db.delete(lotteryDraws).where(inArray(lotteryDraws.id, batch));
  }
}

export async function deleteTopupsByIds(ids: string[]): Promise<void> {
  for (const batch of batchRows(ids, 1)) {
    await db.delete(topups).where(inArray(topups.id, batch));
  }
}

export async function deleteTemporaryBalancesByIds(ids: string[]): Promise<void> {
  for (const batch of batchRows(ids, 1)) {
    await db.delete(temporaryBalances).where(inArray(temporaryBalances.id, batch));
  }
}

/**
 * 活动结束时作废该轮未使用的券（ticketsExpireOnActivityEnd 开启时调用）。
 * 只标记 expired=1，不物理删除，便于管理端对账和用户查看历史。
 * 返回作废的券数量。
 */
export async function expireTicketsForActivity(userId: string, activityKey: string): Promise<number> {
  const { changes } = await d1Run(
    "UPDATE lottery_ticket SET expired = 1 WHERE userId = ? AND activityKey = ? AND usedDrawId IS NULL AND expired = 0",
    [userId, activityKey],
  );
  return changes;
}

/**
 * 2026-10-29 新增：累计统计行的增量 UPSERT。
 *
 * 一条语句同时完成「没有行就按增量建行 / 有行就累加」，依赖主键 ("userId", scope)；
 * 不读旧值再写回，所以并发开奖不会互相覆盖。`lastDrawAt` 只取较大的那个。
 */
const STATS_NUMERIC_COLUMNS = [
  "draws",
  "outerHits",
  "paidOut",
  "clawedBack",
  "ticketFace",
  "boughtTickets",
  "boughtCredits",
  "unusedTickets",
  "unusedCredits",
  "giftTickets",
  "prizeTickets",
] as const;

async function upsertStatsRow(
  userId: string,
  scope: string,
  delta: LotteryStatsDelta,
): Promise<void> {
  const columns = STATS_NUMERIC_COLUMNS.map((column) => `"${column}"`).join(", ");
  const placeholders = STATS_NUMERIC_COLUMNS.map(() => "?").join(", ");
  const increments = STATS_NUMERIC_COLUMNS.map(
    (column) => `"${column}" = "${column}" + excluded."${column}"`,
  ).join(", ");
  const values = STATS_NUMERIC_COLUMNS.map((column) => delta[column] ?? 0);
  await d1Run(
    `INSERT INTO lottery_user_stats ("userId", scope, ${columns}, "lastDrawAt", "updatedAt") ` +
      `VALUES (?, ?, ${placeholders}, ?, ?) ` +
      `ON CONFLICT("userId", scope) DO UPDATE SET ${increments}, ` +
      `"lastDrawAt" = CASE ` +
      `WHEN excluded."lastDrawAt" IS NULL THEN "lastDrawAt" ` +
      `WHEN "lastDrawAt" IS NULL OR excluded."lastDrawAt" > "lastDrawAt" THEN excluded."lastDrawAt" ` +
      `ELSE "lastDrawAt" END, ` +
      `"updatedAt" = excluded."updatedAt"`,
    // d1Run 走 JSON，Date 会被序列化成 ISO 字符串，这里必须传毫秒数。
    [userId, scope, ...values, delta.lastDrawAt ? delta.lastDrawAt.getTime() : null, Date.now()],
  );
}

function drawStatScopes(activityKey: string | null): string[] {
  return activityKey ? [LOTTERY_STATS_ALL_SCOPE, activityKey] : [LOTTERY_STATS_ALL_SCOPE];
}

/** 整批开奖计入累计：全量口径 + 该批所属活动轮次各一行。 */
export async function applyDrawStats(
  userId: string,
  activityKey: string | null,
  delta: LotteryStatsDelta,
): Promise<void> {
  await Promise.all(drawStatScopes(activityKey).map((scope) => upsertStatsRow(userId, scope, delta)));
}

/** 回滚整批开奖：反向累加；`lastDrawAt` 用明细重算（增量表达不了「退回上一次时间」）。 */
export async function revertDrawStats(
  userId: string,
  activityKey: string | null,
  delta: LotteryStatsDelta,
): Promise<void> {
  const scopes = drawStatScopes(activityKey);
  await Promise.all(scopes.map((scope) => upsertStatsRow(userId, scope, negateStatsDelta(delta))));
  await Promise.all(
    scopes.map((scope) =>
      d1Run(
        `UPDATE lottery_user_stats SET "lastDrawAt" = ` +
          `(SELECT MAX(createdAt) FROM lottery_draw WHERE userId = ? AND (? = 'all' OR activityKey = ?)) ` +
          `WHERE "userId" = ? AND scope = ?`,
        [userId, scope, scope, userId, scope],
      ),
    ),
  );
}

/** 券包侧计数只维护全量口径（活动轮次口径的券统计走明细查询）。 */
export async function applyTicketStats(userId: string, delta: LotteryStatsDelta): Promise<void> {
  await upsertStatsRow(userId, LOTTERY_STATS_ALL_SCOPE, delta);
}
