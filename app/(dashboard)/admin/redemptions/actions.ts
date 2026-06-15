"use server";

import { db } from "@/lib/db/d1-http";
import { redemptions, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { revalidatePath } from "next/cache";

function generateCode(length: number = 16): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉容易混淆的字符
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function generateRedemptionCodes(formData: {
  count: number;
  quota: number;
  maxUses: number;
  expiresInDays: number | null;
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

  // 验证输入
  if (formData.count < 1 || formData.count > 100) {
    throw new Error("生成数量必须在 1-100 之间");
  }

  if (formData.quota <= 0) {
    throw new Error("额度必须大于 0");
  }

  if (formData.maxUses < 1) {
    throw new Error("最大使用次数必须大于 0");
  }

  // 计算过期时间
  const expiresAt = formData.expiresInDays
    ? new Date(Date.now() + formData.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  // 批量生成兑换码
  const codes: Array<{
    code: string;
    type: number;
    quota: number;
    maxUses: number;
    usedCount: number;
    expiresAt: Date | null;
    createdBy: string;
  }> = [];

  for (let i = 0; i < formData.count; i++) {
    codes.push({
      code: generateCode(),
      type: 1, // 1=充值兑换码
      quota: formData.quota,
      maxUses: formData.maxUses,
      usedCount: 0,
      expiresAt: expiresAt,
      createdBy: currentUserId,
    });
  }

  // 插入数据库
  await db.insert(redemptions).values(codes);

  revalidatePath("/admin/redemptions");
  return { success: true, count: formData.count };
}
