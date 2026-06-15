"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/usage/meter";
import { generateApiKey } from "@/lib/auth/api-key";
import { db } from "@/lib/db/d1-http";
import { apiKeys, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export interface CreateKeyResult {
  success: boolean;
  key?: string;
  error?: string;
}

export async function createApiKeyAction(formData: FormData): Promise<CreateKeyResult> {
  try {
    const userId = await requireUser();
    const name = String(formData.get("name") || "").trim();

    if (!name) {
      return { success: false, error: "API key 名称不能为空" };
    }

    const { key, hash, prefix } = generateApiKey();

    await db.insert(apiKeys).values({
      userId,
      name,
      keyHash: hash,
      prefix,
    });

    revalidatePath("/keys");
    return { success: true, key };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "创建失败",
    };
  }
}

export async function revokeApiKeyAction(keyId: string) {
  try {
    const userId = await requireUser();

    await db
      .update(apiKeys)
      .set({ status: 2 }) // 2 = disabled
      .where(eq(apiKeys.id, keyId));

    revalidatePath("/keys");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "撤销失败",
    };
  }
}

export async function toggleApiKeyAction(keyId: string) {
  try {
    const userId = await requireUser();

    // 查询当前状态
    const rows = await db
      .select({ status: apiKeys.status })
      .from(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
      .limit(1);

    if (!rows[0]) {
      return { success: false, error: "API key 不存在" };
    }

    // 切换：1↔2（启用↔禁用）
    const newStatus = rows[0].status === 1 ? 2 : 1;

    await db
      .update(apiKeys)
      .set({ status: newStatus })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)));

    revalidatePath("/keys");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "操作失败",
    };
  }
}

export async function deleteApiKeyAction(keyId: string) {
  try {
    const userId = await requireUser();

    await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)));

    revalidatePath("/keys");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "删除失败",
    };
  }
}

export async function updateApiKeyAction(
  keyId: string,
  data: {
    name: string;
    quotaCredits: number | null;
    expiresAt: number | null;
    allowedIps: string | null;
    allowedModels: string | null;
  }
) {
  try {
    const userId = await requireUser();

    // 如果设置了额度限制，检查是否超过账户余额
    if (data.quotaCredits !== null) {
      const userRows = await db
        .select({ balanceCredits: users.balanceCredits })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const userBalance = userRows[0]?.balanceCredits || 0;

      if (data.quotaCredits > userBalance) {
        return {
          success: false,
          error: `API Key 额度不能超过账户余额（${userBalance.toLocaleString()} credits）`,
        };
      }
    }

    // 获取当前 key 的 remainCredits
    const keyRows = await db
      .select({ remainCredits: apiKeys.remainCredits, quotaCredits: apiKeys.quotaCredits })
      .from(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
      .limit(1);

    if (!keyRows[0]) {
      return { success: false, error: "API Key 不存在" };
    }

    const currentRemain = keyRows[0].remainCredits;
    const currentQuota = keyRows[0].quotaCredits;

    // 如果修改了总额度，同步调整剩余额度
    let newRemainCredits = currentRemain;
    if (data.quotaCredits !== null && data.quotaCredits !== currentQuota) {
      // 新总额度 = 旧总额度时，保持剩余额度不变
      // 新总额度 > 旧总额度时，增加剩余额度（增量 = 新总额 - 旧总额）
      // 新总额度 < 旧总额度时，减少剩余额度，但不低于 0
      if (currentQuota !== null && currentRemain !== null) {
        const delta = data.quotaCredits - currentQuota;
        newRemainCredits = Math.max(0, currentRemain + delta);
      } else {
        // 从无限额度切换到有限额度，初始化剩余额度 = 总额度
        newRemainCredits = data.quotaCredits;
      }
    } else if (data.quotaCredits === null) {
      // 切换到无限额度
      newRemainCredits = null;
    }

    await db
      .update(apiKeys)
      .set({
        name: data.name,
        quotaCredits: data.quotaCredits,
        remainCredits: newRemainCredits,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        allowedIps: data.allowedIps,
        allowedModels: data.allowedModels,
      })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)));

    revalidatePath("/keys");
    return { success: true };
  } catch (err) {
    console.error("[updateApiKeyAction] error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "更新失败",
    };
  }
}
