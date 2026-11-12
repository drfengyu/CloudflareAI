import { and, eq } from "drizzle-orm";
import { d1Run, db } from "@/lib/db/d1-http";
import { activityMilestones, temporaryBalances, topups, type ActivityKind } from "@/lib/db/schema";

/**
 * 新玩法的发奖原语：奖励只进 tcr（临时余额）并补一笔账本流水。
 *
 * 与转盘 / 翻牌 / 雷电同一口径：两笔插入任一失败就撤掉已写的行，
 * 让调用方看到的异常与账面一致，不会出现「有流水没余额」或反过来。
 */

const DAY_MS = 86_400_000;
const round2 = (value: number): number => Math.round(value * 100) / 100;

export async function grantTempCredits(input: {
  userId: string;
  amount: number;
  topupType: number;
  /** 账本描述；同时作为 tcr 明细的描述。 */
  description: string;
  validDays: number;
}): Promise<number> {
  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const days = Math.max(1, Math.trunc(input.validDays));
  const now = new Date();
  const balanceId = crypto.randomUUID();
  const topupId = crypto.randomUUID();

  await db.insert(temporaryBalances).values({
    id: balanceId,
    userId: input.userId,
    amount,
    expiresAt: new Date(now.getTime() + days * DAY_MS),
    description: `${input.description}（有效期 ${days} 天）`,
    createdAt: now,
  });
  try {
    await db.insert(topups).values({
      id: topupId,
      userId: input.userId,
      amount,
      type: input.topupType,
      description: input.description,
      createdAt: now,
    });
  } catch (error) {
    await db.delete(temporaryBalances).where(eq(temporaryBalances.id, balanceId)).catch(() => undefined);
    throw error;
  }
  return amount;
}

export interface MilestoneGrant {
  /** 本次是否真的发出去了；false = 之前已经领过。 */
  granted: boolean;
  reward: number;
}

/**
 * 一次性里程碑：先占唯一键，抢到才发钱；发钱失败把占位删掉，下次还能再领。
 *
 * 唯一索引是 `(userId, activityKind, activityKey, tierKey)`，所以并发两个请求
 * 只有一个会拿到 `changes === 1`，不会重复发。
 */
export async function grantActivityMilestone(input: {
  userId: string;
  kind: ActivityKind;
  activityKey: string;
  tierKey: string;
  reward: number;
  topupType: number;
  description: string;
  validDays: number;
}): Promise<MilestoneGrant> {
  const reward = round2(Number(input.reward));
  if (!(reward > 0)) return { granted: false, reward: 0 };

  const id = crypto.randomUUID();
  const claimed = await d1Run(
    `INSERT OR IGNORE INTO activity_milestone
       (id, userId, activityKind, activityKey, tierKey, rewardCredits, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.userId, input.kind, input.activityKey, input.tierKey, reward, Date.now()],
  ).catch(() => ({ changes: 0 }));
  if (claimed.changes !== 1) return { granted: false, reward: 0 };

  try {
    await grantTempCredits({
      userId: input.userId,
      amount: reward,
      topupType: input.topupType,
      description: input.description,
      validDays: input.validDays,
    });
  } catch (error) {
    await d1Run("DELETE FROM activity_milestone WHERE id = ?", [id]).catch(() => undefined);
    throw error;
  }
  return { granted: true, reward };
}

/** 当前轮次已经领过的里程碑键；页面与写入侧用它避免重复尝试发奖。 */
export async function listGrantedMilestones(
  userId: string,
  kind: ActivityKind,
  activityKey: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ tierKey: activityMilestones.tierKey })
    .from(activityMilestones)
    .where(
      and(
        eq(activityMilestones.userId, userId),
        eq(activityMilestones.activityKind, kind),
        eq(activityMilestones.activityKey, activityKey),
      ),
    )
    .catch(() => []);
  return new Set(rows.map((row) => row.tierKey));
}

export { round2 };
