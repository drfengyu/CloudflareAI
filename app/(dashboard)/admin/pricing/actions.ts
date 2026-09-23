"use server";

import { db } from "@/lib/db/d1-http";
import { modelPricing, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/usage/meter";
import { eq } from "drizzle-orm";

/**
 * 更新单个模型的定价倍率（仅管理员）。
 */
export async function updateModelMultiplier(
  modelId: string,
  multiplier: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await requireUser();

    // 校验管理员权限
    const userRows = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRows[0] || userRows[0].role < 10) {
      return { success: false, error: "权限不足" };
    }

    // 校验倍率范围（0.01 ~ 100）
    if (multiplier < 0.01 || multiplier > 100) {
      return { success: false, error: "倍率必须在 0.01 ~ 100 之间" };
    }

    // 更新 multiplier
    await db
      .update(modelPricing)
      .set({
        multiplier,
        updatedAt: new Date(),
      })
      .where(eq(modelPricing.modelId, modelId));

    return { success: true };
  } catch (error) {
    console.error("[updateModelMultiplier] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "更新失败",
    };
  }
}

/**
 * 更新单个模型的余额预检预留档位（输出 token 数，仅管理员）。
 * 客户端 max_tokens 超过它时按它算，避免默认 32000 的客户端被全量预留挡在 402。
 */
export async function updateModelReserve(
  modelId: string,
  tokens: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await requireUser();

    const userRows = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRows[0] || userRows[0].role < 10) {
      return { success: false, error: "权限不足" };
    }

    if (!Number.isInteger(tokens) || tokens < 1 || tokens > 128_000) {
      return { success: false, error: "预留档位必须是 1 ~ 128000 的整数" };
    }

    await db
      .update(modelPricing)
      .set({ reserveOutputTokens: tokens, updatedAt: new Date() })
      .where(eq(modelPricing.modelId, modelId));

    return { success: true };
  } catch (error) {
    console.error("[updateModelReserve] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "更新失败",
    };
  }
}

/**
 * 批量更新多个模型的定价倍率（仅管理员）。
 */
export async function batchUpdateMultipliers(
  updates: Array<{ modelId: string; multiplier: number }>,
): Promise<{ success: boolean; updated: number; errors: string[] }> {
  try {
    const userId = await requireUser();

    // 校验管理员权限
    const userRows = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRows[0] || userRows[0].role < 10) {
      return { success: false, updated: 0, errors: ["权限不足"] };
    }

    let updated = 0;
    const errors: string[] = [];

    for (const { modelId, multiplier } of updates) {
      // 校验倍率范围
      if (multiplier < 0.01 || multiplier > 100) {
        errors.push(`${modelId}: 倍率必须在 0.01 ~ 100 之间`);
        continue;
      }

      try {
        await db
          .update(modelPricing)
          .set({
            multiplier,
            updatedAt: new Date(),
          })
          .where(eq(modelPricing.modelId, modelId));
        updated++;
      } catch (e) {
        errors.push(`${modelId}: ${e instanceof Error ? e.message : "更新失败"}`);
      }
    }

    return { success: errors.length === 0, updated, errors };
  } catch (error) {
    console.error("[batchUpdateMultipliers] Error:", error);
    return {
      success: false,
      updated: 0,
      errors: [error instanceof Error ? error.message : "批量更新失败"],
    };
  }
}
