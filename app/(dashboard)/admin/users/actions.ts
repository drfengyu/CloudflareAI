"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db/d1-http";
import { users, topups } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { revalidatePath } from "next/cache";
import { formatCnWallClock } from "@/lib/date";
import {
  sendMessage,
  validateAttachment,
  type Attachment,
} from "@/lib/message/messages";

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

/** 管理员鉴权：返回操作者本人，供「谁改的」落到站内信上。 */
async function assertAdmin(): Promise<{ id: string; email: string | null; role: number }> {
  const currentUserId = await requireUser();
  const rows = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);
  const actor = rows[0];
  if (!actor || actor.role < 10) {
    throw new Error("权限不足");
  }
  return actor;
}

/**
 * 可读的随机临时密码：去掉 `O0Il1` 这类容易看错的字符，保证大小写 + 数字，
 * 让用户能照着站内信敲进登录框。
 */
function generatePassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  // 三类字符各强制一个，否则随机出来可能全是小写，用户会以为密码坏了。
  chars[0] = String.fromCharCode(65 + (bytes[0] % 26));
  chars[1] = String.fromCharCode(97 + (bytes[1] % 26));
  chars[2] = String(1 + (bytes[2] % 9));
  return chars.join("");
}

/**
 * 管理员重置某个用户的登录密码。
 *
 * 库里只写 bcrypt hash，明文**只在这次调用的返回值里出现一次**，界面显示给管理员后就丢掉。
 * 是否把明文一并写进给用户的站内信由 `includePassword` 决定，默认不写。
 */
export async function resetUserPassword(input: {
  userId: string;
  newPassword?: string;
  notifyUser: boolean;
  includePassword: boolean;
}): Promise<{ password: string; notified: boolean }> {
  const actor = await assertAdmin();
  if (actor.role < 100 && input.userId !== actor.id) {
    // 管理员之间互相改密等于提权通道，只让超管做。
    const target = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if ((target[0]?.role ?? 0) >= 10) {
      throw new Error("仅超级管理员可重置管理员账号的密码");
    }
  }

  const password = input.newPassword?.trim() ? input.newPassword.trim() : generatePassword();
  if (password.length < 8) throw new Error("密码至少 8 位");
  if (password.length > 72) throw new Error("密码最多 72 位");

  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!rows[0]) throw new Error("用户不存在");

  await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(password, 10) })
    .where(eq(users.id, input.userId));

  let notified = false;
  if (input.notifyUser) {
    await sendMessage({
      userId: input.userId,
      kind: "security",
      title: "登录密码已被管理员重置",
      body: [
        `管理员 ${actor.email ?? "未署名"} 于 ${formatCnWallClock(new Date())} 重置了你的登录密码。`,
        input.includePassword ? `新密码：${password}` : "新密码已由管理员另行告知你。",
        "请立即登录并改成只有你知道的密码。如果这不是你发起的操作，请马上联系管理员。",
      ].join("\n\n"),
      sentBy: actor.id,
    });
    notified = true;
  }

  revalidatePath("/admin/users");
  return { password, notified };
}

/** 管理员手动发一封站内信，可带附件奖励（附件在用户点「领取」时才真的入账）。 */
export async function sendUserMessage(input: {
  userId: string;
  title: string;
  body: string;
  kind: "notice" | "reward";
  attachment: Attachment | null;
}): Promise<void> {
  const actor = await assertAdmin();
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error("主题不能为空");
  if (!body) throw new Error("正文不能为空");
  if (input.attachment) {
    const problem = validateAttachment(input.attachment);
    if (problem) throw new Error(problem);
  }

  await sendMessage({
    userId: input.userId,
    kind: input.attachment ? "reward" : input.kind,
    title,
    body,
    attachment: input.attachment,
    sentBy: actor.id,
  });
  revalidatePath("/admin/users");
}
