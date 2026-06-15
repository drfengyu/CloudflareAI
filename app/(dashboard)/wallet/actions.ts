"use server";

import { db } from "@/lib/db/d1-http";
import { redemptions, topups, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { revalidatePath } from "next/cache";

export async function redeemCode(code: string) {
  const currentUserId = await requireUser();

  // 查找兑换码
  const codeRows = await db
    .select()
    .from(redemptions)
    .where(eq(redemptions.code, code.toUpperCase().trim()))
    .limit(1);

  if (!codeRows[0]) {
    throw new Error("兑换码不存在");
  }

  const redemption = codeRows[0];

  // 检查是否已使用完
  const maxUses = redemption.maxUses ?? Infinity;
  if (redemption.usedCount >= maxUses) {
    throw new Error("兑换码已用完");
  }

  // 检查是否过期
  if (redemption.expiresAt && new Date(redemption.expiresAt) < new Date()) {
    throw new Error("兑换码已过期");
  }

  // 获取用户当前余额
  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!userRows[0]) {
    throw new Error("用户不存在");
  }

  const currentBalance = userRows[0].balanceCredits;
  const newBalance = currentBalance + redemption.quota;

  // 更新用户余额
  await db
    .update(users)
    .set({ balanceCredits: newBalance })
    .where(eq(users.id, currentUserId));

  // 更新兑换码使用次数
  await db
    .update(redemptions)
    .set({ usedCount: redemption.usedCount + 1 })
    .where(eq(redemptions.id, redemption.id));

  // 记录充值流水
  await db.insert(topups).values({
    userId: currentUserId,
    amount: redemption.quota,
    type: 1, // 兑换码充值
    description: `兑换码充值: ${code}`,
  });

  revalidatePath("/wallet");
  return {
    success: true,
    amount: redemption.quota,
    newBalance,
  };
}
