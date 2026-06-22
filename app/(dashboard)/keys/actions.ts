"use server";

// Server Actions version marker - force rebuild: v2.0.1
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/usage/meter";
import { generateApiKey } from "@/lib/auth/api-key";
import { db } from "@/lib/db/d1-http";
import { apiKeys, users, usageLogs } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getActualBalance } from "@/lib/billing/display-balance";

export interface CreateKeyResult {
  success: boolean;
  key?: string;
  error?: string;
}

export async function createApiKeyAction(formData: FormData): Promise<CreateKeyResult> {
  try {
    const userId = await requireUser();
    const name = String(formData.get("name") || "").trim();
    const channelId = String(formData.get("channelId") || "").trim() || null;

    if (!name) {
      return { success: false, error: "API key 名称不能为空" };
    }

    const { key, hash, prefix } = generateApiKey();

    await db.insert(apiKeys).values({
      userId,
      name,
      keyHash: hash,
      prefix,
      channelId: channelId || undefined,
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
    channelId?: string | null;
  }
) {
  try {
    console.log("[updateApiKeyAction] Starting update:", { keyId, newName: data.name });

    const userId = await requireUser();

    // 如果设置了额度限制，检查是否超过账户实际余额（永久 + 未过期临时）
    if (data.quotaCredits !== null) {
      const userBalance = await getActualBalance(userId);

      if (data.quotaCredits > userBalance) {
        return {
          success: false,
          error: `API Key 额度不能超过账户余额（${Math.round(userBalance).toLocaleString()} credits）`,
        };
      }
    }

    // 获取当前 key 信息
    const keyRows = await db
      .select({ remainCredits: apiKeys.remainCredits, quotaCredits: apiKeys.quotaCredits, name: apiKeys.name })
      .from(apiKeys)
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
      .limit(1);

    if (!keyRows[0]) {
      console.log("[updateApiKeyAction] Key not found");
      return { success: false, error: "API Key 不存在" };
    }

    console.log("[updateApiKeyAction] Current key:", { oldName: keyRows[0].name, keyId });

    // 从 usage_log 计算实际使用量
    const usageRows = await db
      .select({ totalUsed: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)` })
      .from(usageLogs)
      .where(eq(usageLogs.apiKeyId, keyId));

    const actualUsed = usageRows[0]?.totalUsed || 0;

    // 计算新的剩余额度
    let newRemainCredits: number | null = null;
    if (data.quotaCredits !== null) {
      // 新剩余 = 新总额 - 实际使用量
      newRemainCredits = Math.max(0, data.quotaCredits - actualUsed);
    }

    console.log("[updateApiKeyAction] Updating database...", { newName: data.name });

    await db
      .update(apiKeys)
      .set({
        name: data.name,
        quotaCredits: data.quotaCredits,
        remainCredits: newRemainCredits,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        allowedIps: data.allowedIps,
        allowedModels: data.allowedModels,
        channelId: data.channelId || null,
      })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)));

    console.log("[updateApiKeyAction] Database updated successfully");

    // 强制重新验证 /keys 页面缓存
    revalidatePath("/keys");
    revalidatePath("/keys", "page");

    console.log("[updateApiKeyAction] Revalidation triggered");

    return { success: true };
  } catch (err) {
    console.error("[updateApiKeyAction] error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "更新失败",
    };
  }
}
