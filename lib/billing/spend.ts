import { and, asc, eq, gt, sql } from "drizzle-orm";
import { d1Run, db } from "@/lib/db/d1-http";
import { temporaryBalances, topups, users } from "@/lib/db/schema";

/**
 * 花 cr：先扣未过期的临时余额（最早过期的先扣），不足再扣永久余额。
 * 与消费侧 `deductCredits` 同一优先级，区别是这里要求总额足够——买券、买游戏装备都不允许透支。
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

/**
 * 把一次失败的扣款退回永久余额（比原路退回只多不少），并补一条管理员调整流水。
 * 与买券失败的回滚同口径：钱不会凭空消失，人工按流水能对上。
 */
export async function refundPermanentCredits(
  userId: string,
  amount: number,
  description: string,
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  await db
    .update(users)
    .set({ balanceCredits: sql`${users.balanceCredits} + ${amount}` })
    .where(eq(users.id, userId));
  await db.insert(topups).values({
    id: crypto.randomUUID(),
    userId,
    amount,
    type: 2,
    description,
    createdAt: new Date(),
  });
}
