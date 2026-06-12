"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/usage/meter";
import { generateApiKey } from "@/lib/auth/api-key";
import { db } from "@/lib/db/d1-http";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
      .set({ revoked: true })
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
