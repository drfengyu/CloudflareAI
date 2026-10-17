"use server";

import { batchRows, db } from "@/lib/db/d1-http";
import { MAX_REDEMPTION_QUOTA, MAX_REDEMPTION_USES } from "@/lib/billing/redemption-limits";
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

/**
 * 单码额度与次数上限见 `lib/billing/redemption-limits.ts`（前端表单共用同一份数值）。
 * 加校验的起因：此前这里只校验 `quota > 0`，线上发出过 10 亿 cr 的码。
 */
export async function generateRedemptionCodes(formData: {
  count: number;
  quota: number;
  maxUses: number;
  expiresInDays: number | null;
  balanceValidDays: number | null;
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

  // 验证输入。注意 NaN 过不了 `<= 0` 这类比较，所以先判 Number.isFinite。
  if (!Number.isFinite(formData.count) || formData.count < 1 || formData.count > 100) {
    throw new Error("生成数量必须在 1-100 之间");
  }

  if (!Number.isFinite(formData.quota) || formData.quota <= 0) {
    throw new Error("额度必须大于 0");
  }
  if (formData.quota > MAX_REDEMPTION_QUOTA) {
    throw new Error(`单码额度不能超过 ${MAX_REDEMPTION_QUOTA} cr（当前 ${formData.quota} cr）`);
  }

  if (!Number.isFinite(formData.maxUses) || formData.maxUses < 1) {
    throw new Error("最大使用次数必须大于 0");
  }
  if (formData.maxUses > MAX_REDEMPTION_USES) {
    throw new Error(`单码最大使用次数不能超过 ${MAX_REDEMPTION_USES}`);
  }

  // 计算兑换码过期时间
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
    balanceValidDays: number | null;
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
      balanceValidDays: formData.balanceValidDays,
      createdBy: currentUserId,
    });
  }

  // 插入数据库：每行实际绑定 10 个参数（含 id / createdAt 的 $defaultFn），
  // 一次生成 100 条会远超 D1 的 100 参数墙，必须分片。
  for (const batch of batchRows(codes, 10)) {
    await db.insert(redemptions).values(batch);
  }

  revalidatePath("/admin/redemptions");
  return { success: true, count: formData.count };
}
