"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db/d1-http";
import { users, topups } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { revalidatePath } from "next/cache";
import { formatCnWallClock } from "@/lib/date";
import { sendSecurityEmail } from "@/lib/email";
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

  // 正负都记流水：扣减不落账会让账本合计与余额对不上
  await db.insert(topups).values({
    userId: formData.userId,
    amount: formData.amount,
    type: 2, // 管理员调整
    description:
      formData.description ||
      (formData.amount > 0 ? "管理员手动充值" : "管理员手动扣减"),
  });

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

export async function resetUserPassword(input: {
  userId: string;
  newPassword?: string;
  includePassword: boolean;
}): Promise<{ password: string; warnings: string[] }> {
  const parsed = z.object({
    userId: z.string().min(1).max(128),
    newPassword: z.string().optional(),
    includePassword: z.boolean(),
  }).safeParse(input);
  if (!parsed.success) throw new Error("重置密码参数无效");
  input = parsed.data;
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

  const changedAt = formatCnWallClock(new Date());
  const title = "登录密码已被管理员重置";
  const body = [
    `管理员 ${actor.email ?? "未署名"} 于 ${changedAt} 重置了你的登录密码。`,
    input.includePassword ? `新密码：${password}` : "请联系管理员获取新密码。",
    "请立即登录并改成只有你知道的密码。如果这不是你发起的操作，请马上联系管理员。",
  ].join("\n\n");

  // 密码已生效，通知失败不能吞掉明文结果或诱使管理员重复重置。
  const [userNotice, adminNotice, email] = await Promise.allSettled([
    sendMessage({ userId: input.userId, kind: "security", title, body, sentBy: actor.id }),
    actor.id === input.userId
      ? Promise.resolve()
      : sendMessage({
          userId: actor.id,
          kind: "security",
          title: "用户密码重置记录",
          body: [
            `你于 ${changedAt} 重置了用户 ${rows[0].email ?? input.userId} 的登录密码。`,
            input.includePassword ? `新密码：${password}` : "请将新密码安全地告知该用户。",
            "如非你本人操作，请立即检查账号安全。",
          ].join("\n\n"),
          sentBy: actor.id,
        }),
    sendSecurityEmail({ to: rows[0].email, subject: title, text: body }),
  ]);
  const warnings: string[] = [];
  if (userNotice.status === "rejected") warnings.push("用户站内信发送失败");
  if (adminNotice.status === "rejected") warnings.push("管理员站内信发送失败");
  if (email.status === "rejected") warnings.push("用户邮件发送失败，请检查 SMTP 配置");
  else if (!email.value.sent) warnings.push(email.value.error ?? "用户邮件发送失败");

  revalidatePath("/admin/users");
  return { password, warnings };
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
