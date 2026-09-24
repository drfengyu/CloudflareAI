import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { batchRows, d1Run, db, D1_MAX_BINDINGS } from "@/lib/db/d1-http";
import {
  lotteryDraws,
  lotteryTickets,
  temporaryBalances,
  topups,
  users,
} from "@/lib/db/schema";

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

/** 可用券数量。 */
export async function countUnusedTickets(userId: string): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(lotteryTickets)
    .where(and(eq(lotteryTickets.userId, userId), isNull(lotteryTickets.usedDrawId)));
  return Number(rows[0]?.c ?? 0);
}

/** 累计抽奖次数，累抽档位的判定依据。 */
export async function countDraws(userId: string): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(lotteryDraws)
    .where(eq(lotteryDraws.userId, userId));
  return Number(rows[0]?.c ?? 0);
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

/** 取 n 张未消耗的券 id（最早发放的优先）。 */
export async function pickUnusedTicketIds(userId: string, n: number): Promise<string[]> {
  const rows = await db
    .select({ id: lotteryTickets.id })
    .from(lotteryTickets)
    .where(and(eq(lotteryTickets.userId, userId), isNull(lotteryTickets.usedDrawId)))
    .orderBy(asc(lotteryTickets.createdAt))
    .limit(n);
  return rows.map((r) => r.id);
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
  grant: { source: "buy" | "gift" | "prize"; priceCredits?: number; milestoneDraws?: number },
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
      // 一个档位送多张时，各行靠序号区分，否则第二行会撞 (userId, milestoneDraws) 唯一索引。
      milestoneSeq: grant.milestoneDraws === undefined ? 0 : index,
      createdAt: new Date(),
    };
  });
  // 每行绑 7 个参数，一次买 50 张就是 350 个，会直接撞 D1 的参数墙，必须分片。
  for (const batch of batchRows(values, 7)) {
    await db.insert(lotteryTickets).values(batch);
  }
  return ids;
}

/** 收回刚发出的券；发券之后还有步骤失败时用它把券清干净。 */
export async function deleteTickets(ids: string[]): Promise<void> {
  for (const batch of batchRows(ids, 1)) {
    await db.delete(lotteryTickets).where(inArray(lotteryTickets.id, batch));
  }
}

/**
 * 扣 credits：先扣未过期的临时余额（最早过期的先扣），不足再扣永久余额。
 * 与消费侧 `deductCredits` 同一优先级，区别是这里要求总额足够——买券不允许透支。
 */
export async function spendCredits(
  userId: string,
  amount: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let remaining = amount;
  const touched: { id: string; taken: number }[] = [];
  const emptied: string[] = [];

  if (remaining > 0) {
    const now = new Date();
    const temps = await db
      .select({ id: temporaryBalances.id, amount: temporaryBalances.amount })
      .from(temporaryBalances)
      // 必须用 gt()：`expiresAt` 存的是毫秒整数，raw sql 模板会把 Date 绑定成 ISO 字符串，
      // SQLite 里数字恒小于字符串，条件永真不成立 → 临时余额一层都扣不到。
      .where(and(eq(temporaryBalances.userId, userId), gt(temporaryBalances.expiresAt, now)))
      .orderBy(asc(temporaryBalances.expiresAt));

    for (const temp of temps) {
      if (remaining <= 0) break;
      const take = Math.min(temp.amount, remaining);
      if (take <= 0) continue;
      const { changes } = await d1Run(
        "UPDATE temporary_balance SET amount = amount - ? WHERE id = ? AND amount >= ?",
        [take, temp.id, take],
      );
      if (changes === 1) {
        touched.push({ id: temp.id, taken: take });
        if (take >= temp.amount) emptied.push(temp.id);
        remaining = Math.round((remaining - take) * 1e6) / 1e6;
      }
    }
  }

  if (remaining > 0) {
    const { changes } = await d1Run(
      "UPDATE user SET balanceCredits = balanceCredits - ? WHERE id = ? AND balanceCredits >= ?",
      [remaining, userId, remaining],
    );
    if (changes !== 1) {
      for (const t of touched) {
        await d1Run("UPDATE temporary_balance SET amount = amount + ? WHERE id = ?", [
          t.taken,
          t.id,
        ]);
      }
      return { ok: false, reason: "余额不足" };
    }
  }

  // 花空的行与消费侧 deductCredits 一样删掉，钱包的临时余额明细才不会留 0 cr 条目。
  for (const id of emptied) {
    await db.delete(temporaryBalances).where(eq(temporaryBalances.id, id));
  }

  return { ok: true };
}

/** 结算倒扣：把整批的净负数一次加到永久余额上（允许余额变负，与消费扣费口径一致）。 */
export async function adjustPermanentBalance(userId: string, delta: number): Promise<void> {
  await db
    .update(users)
    .set({ balanceCredits: sql`${users.balanceCredits} + ${delta}` })
    .where(eq(users.id, userId));
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
