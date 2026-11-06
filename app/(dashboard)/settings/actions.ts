"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/d1-http";
import { users } from "@/lib/db/schema";
import { requireUser } from "@/lib/usage/meter";
import { formatCnWallClock } from "@/lib/date";
import { sendMessage } from "@/lib/message/messages";

/**
 * 用户自己改登录密码。
 *
 * OAuth/LinuxDO 注册的账号原本没有密码（`passwordHash` 为空），这类账号走「首次设置」分支，
 * 不校验当前密码。
 */
export async function changeMyPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ firstTime: boolean }> {
  const userId = await requireUser();
  const rows = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = rows[0];
  if (!user) throw new Error("用户不存在");

  const hasPassword = Boolean(user.passwordHash);
  const next = input.newPassword;
  if (next.length < 8) throw new Error("新密码至少 8 位");
  if (next.length > 72) throw new Error("新密码最多 72 位");

  if (hasPassword) {
    const ok = await bcrypt.compare(input.currentPassword, user.passwordHash as string);
    if (!ok) throw new Error("当前密码不正确");
    if (input.currentPassword === next) throw new Error("新密码不能与当前密码相同");
  }

  await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(next, 10) })
    .where(eq(users.id, userId));

  await sendMessage({
    userId,
    kind: "security",
    title: hasPassword ? "登录密码已修改" : "登录密码已设置",
    body: `你于 ${formatCnWallClock(new Date())} ${hasPassword ? "修改" : "设置"}了登录密码。` +
      " 如果这不是你本人的操作，请立即联系管理员冻结账号。",
  });

  revalidatePath("/settings");
  return { firstTime: !hasPassword };
}
