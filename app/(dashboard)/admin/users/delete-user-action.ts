"use server";

import { db } from "@/lib/db/d1-http";
import { users, apiKeys, usageLogs, topups, temporaryBalances, checkins } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { revalidatePath } from "next/cache";

/**
 * 删除用户及其所有关联数据
 *
 * 安全检查：
 * - 只有管理员可以删除
 * - 不能删除自己
 * - 不能删除超级管理员（role >= 100）
 */
export async function deleteUser(targetUserId: string): Promise<{
  success: boolean;
  message?: string;
}> {
  try {
    const currentUserId = await requireUser();

    // 检查当前用户权限
    const currentUser = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, currentUserId))
      .limit(1);

    if (!currentUser[0] || currentUser[0].role < 10) {
      return { success: false, message: "权限不足" };
    }

    // 检查目标用户
    const targetUser = await db
      .select({ role: users.role, email: users.email })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!targetUser[0]) {
      return { success: false, message: "用户不存在" };
    }

    // 不能删除自己
    if (targetUserId === currentUserId) {
      return { success: false, message: "不能删除自己的账户" };
    }

    // 不能删除超级管理员
    if (targetUser[0].role >= 100) {
      return { success: false, message: "不能删除超级管理员" };
    }

    // 级联删除所有关联数据
    // 注意：D1 的 ON DELETE CASCADE 可能不完全生效，手动删除确保彻底
    console.log(`[deleteUser] Deleting user ${targetUser[0].email} (${targetUserId})`);

    // 1. 删除签到记录
    await db.delete(checkins).where(eq(checkins.userId, targetUserId));

    // 2. 删除临时余额
    await db.delete(temporaryBalances).where(eq(temporaryBalances.userId, targetUserId));

    // 3. 删除充值记录
    await db.delete(topups).where(eq(topups.userId, targetUserId));

    // 4. 删除用量记录
    await db.delete(usageLogs).where(eq(usageLogs.userId, targetUserId));

    // 5. 删除 API Keys
    await db.delete(apiKeys).where(eq(apiKeys.userId, targetUserId));

    // 6. 删除用户
    await db.delete(users).where(eq(users.id, targetUserId));

    console.log(`[deleteUser] Successfully deleted user ${targetUser[0].email}`);

    revalidatePath("/admin/users");

    return {
      success: true,
      message: `已删除用户 ${targetUser[0].email} 及其所有数据`,
    };
  } catch (error) {
    console.error("[deleteUser] Error:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "删除失败",
    };
  }
}
