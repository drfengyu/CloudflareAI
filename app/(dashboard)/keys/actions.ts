"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/usage/meter";
import { generateApiKey } from "@/lib/auth/api-key";
import { db } from "@/lib/db/d1-http";
import { apiKeys } from "@/lib/db/schema";
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
    remainCredits: number | null;
    expiresAt: number | null;
    allowedIps: string | null;
    allowedModels: string | null;
  }
) {
  try {
    const userId = await requireUser();

    await db
      .update(apiKeys)
      .set({
        name: data.name,
        remainCredits: data.remainCredits,
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
