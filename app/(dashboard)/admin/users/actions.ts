"use server";

import { db } from "@/lib/db/d1-http";
import { users, topups } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { revalidatePath } from "next/cache";

export async function adjustUserBalance(formData: {
  userId: string;
  amount: number;
  description: string;
}) {
  const currentUserId = await requireUser();

  // 检查权限
  const currentUser = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 10) {
    throw new Error("权限不足");
  }

  // 获取目标用户
  const targetUser = await db
    .select()
    .from(users)
    .where(eq(users.id, formData.userId))
    .limit(1);

  if (!targetUser[0]) {
    throw new Error("用户不存在");
  }

  // 验证金额
  if (formData.amount === 0) {
    throw new Error("调整金额不能为 0");
  }

  const newBalance = targetUser[0].balanceCredits + formData.amount;
  if (newBalance < 0) {
    throw new Error("余额不足，无法扣减");
  }

  // 更新余额
  await db
    .update(users)
    .set({ balanceCredits: newBalance })
    .where(eq(users.id, formData.userId));

  // 记录充值流水（只记录正数）
  if (formData.amount > 0) {
    await db.insert(topups).values({
      userId: formData.userId,
      amount: formData.amount,
      type: 2, // 管理员充值
      description: formData.description || "管理员手动充值",
    });
  }

  revalidatePath("/admin/users");
  return { success: true, newBalance };
}

export async function updateUserRole(formData: {
  userId: string;
  role: number;
}) {
  const currentUserId = await requireUser();

  // 检查权限
  const currentUser = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 100) {
    throw new Error("仅超级管理员可修改用户角色");
  }

  // 验证角色
  if (![1, 10, 100].includes(formData.role)) {
    throw new Error("无效的角色值");
  }

  // 不能修改自己的角色
  if (formData.userId === currentUserId) {
    throw new Error("不能修改自己的角色");
  }

  // 更新角色
  await db
    .update(users)
    .set({ role: formData.role })
    .where(eq(users.id, formData.userId));

  revalidatePath("/admin/users");
  return { success: true };
}
