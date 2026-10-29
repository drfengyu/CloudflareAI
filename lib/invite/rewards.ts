import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/d1-http";
import { inviteRecords, topups, users } from "@/lib/db/schema";

/** 同一邀请人 24 小时内最多发多少次奖励；超出仍记录邀请关系，但邀请人奖励记 0。 */
export const INVITE_DAILY_REWARD_LIMIT = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `alice@example.com` → `a***@example.com`，邀请记录里展示用。 */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 1)}***@${domain}`;
}

/**
 * 注册成功后发放邀请奖励：写 invite_record，再给双方加永久余额并记 type=7 流水。
 * D1 没有事务，调用方负责在失败时只记日志、不回滚账号（邀请码已归因在 user.invitedBy）。
 */
export async function grantInviteRewards(input: {
  inviterId: string;
  inviteeId: string;
  inviteeEmail: string;
  inviterReward: number;
  inviteeReward: number;
}): Promise<void> {
  const now = new Date();
  const inviteeReward = Math.max(0, input.inviteeReward);

  const recent = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(inviteRecords)
    .where(
      and(
        eq(inviteRecords.inviterId, input.inviterId),
        gte(inviteRecords.createdAt, new Date(now.getTime() - DAY_MS)),
      ),
    );
  const inviterReward =
    (recent[0]?.count ?? 0) >= INVITE_DAILY_REWARD_LIMIT
      ? 0
      : Math.max(0, input.inviterReward);

  await db.insert(inviteRecords).values({
    id: crypto.randomUUID(),
    inviterId: input.inviterId,
    inviteeId: input.inviteeId,
    inviterReward,
    inviteeReward,
    createdAt: now,
  });

  if (inviteeReward > 0) {
    await db
      .update(users)
      .set({ balanceCredits: sql`${users.balanceCredits} + ${inviteeReward}` })
      .where(eq(users.id, input.inviteeId));
    await db.insert(topups).values({
      id: crypto.randomUUID(),
      userId: input.inviteeId,
      amount: inviteeReward,
      type: 7,
      description: "受邀注册奖励",
      createdAt: now,
    });
  }

  if (inviterReward > 0) {
    await db
      .update(users)
      .set({ balanceCredits: sql`${users.balanceCredits} + ${inviterReward}` })
      .where(eq(users.id, input.inviterId));
    await db.insert(topups).values({
      id: crypto.randomUUID(),
      userId: input.inviterId,
      amount: inviterReward,
      type: 7,
      description: `邀请 ${maskEmail(input.inviteeEmail)} 注册奖励`,
      createdAt: now,
    });
  }
}
