"use server";

import { db } from "@/lib/db/d1-http";
import { redemptions, topups, temporaryBalances } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

  // 检查兑换码本身是否过期
  if (redemption.expiresAt && new Date(redemption.expiresAt) < new Date()) {
    throw new Error("兑换码已过期");
  }

  // 计算余额过期时间
  let balanceExpiresAt: Date;
  if (redemption.balanceValidDays) {
    balanceExpiresAt = new Date(Date.now() + redemption.balanceValidDays * 24 * 60 * 60 * 1000);
  } else {
    // 默认 7 天
    balanceExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  const now = new Date();

  // 插入临时余额
  await db.insert(temporaryBalances).values({
    id: crypto.randomUUID(),
    userId: currentUserId,
    amount: redemption.quota,
    expiresAt: balanceExpiresAt,
    redemptionId: redemption.id,
    description: `兑换码充值: ${code}`,
    createdAt: now,
  });

  // 更新兑换码使用次数和使用者
  await db
    .update(redemptions)
    .set({
      usedCount: redemption.usedCount + 1,
      usedUserId: currentUserId,
      redeemedAt: now,
    })
    .where(eq(redemptions.id, redemption.id));

  // 记录充值流水
  await db.insert(topups).values({
    id: crypto.randomUUID(),
    userId: currentUserId,
    amount: redemption.quota,
    type: 1, // 兑换码充值
    description: `兑换码充值: ${code} (有效期至 ${balanceExpiresAt.toLocaleDateString()})`,
    redemptionId: redemption.id,
    createdAt: now,
  });

  revalidatePath("/wallet");
  return {
    success: true,
    amount: redemption.quota,
    expiresAt: balanceExpiresAt,
  };
}
