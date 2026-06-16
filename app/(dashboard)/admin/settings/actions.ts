"use server";

import { db } from "@/lib/db/d1-http";
import { options, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { revalidatePath } from "next/cache";

async function upsertOption(key: string, value: string) {
  const existing = await db
    .select()
    .from(options)
    .where(eq(options.key, key))
    .limit(1);

  if (existing[0]) {
    await db.update(options).set({ value }).where(eq(options.key, key));
  } else {
    await db.insert(options).values({ key, value });
  }
}

export async function updateBasicSettings(formData: {
  siteName: string;
  defaultBalanceValidDays: string;
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
  if (!formData.siteName.trim()) {
    throw new Error("站点名称不能为空");
  }

  const days = parseInt(formData.defaultBalanceValidDays);
  if (isNaN(days) || days <= 0) {
    throw new Error("有效期必须是正整数");
  }

  // 更新设置
  await upsertOption("siteName", formData.siteName.trim());
  await upsertOption("defaultBalanceValidDays", formData.defaultBalanceValidDays);

  revalidatePath("/admin/settings");
  return { success: true };
}
