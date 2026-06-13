import { auth } from "@/auth";
import { db } from "@/lib/db/d1-http";
import { usageLogs, users, apiKeys } from "@/lib/db/schema";
import { calculateCredits } from "@/lib/billing/pricing";
import { eq, sql } from "drizzle-orm";

/**
 * 用量记账 + 扣费（Phase B 起生效）：
 * 1. 计算 credits（基于 catalog 定价 + token 数）。
 * 2. 扣减 user.balanceCredits 和 apiKey.remainCredits（如果非 null）。
 * 3. 写入 usage_log（含 creditsUsed）。
 * 4. 更新 api_key.lastUsedAt 和状态（额度耗尽→4）。
 *
 * 调用前应已校验余额充足（verifyBalance），此处仅扣减；如扣减失败（余额不足）则抛错回滚。
 */
export async function logUsage(input: {
  userId: string;
  apiKeyId?: string;
  model: string;
  task?: string;
  source?: "hosted" | "proxied";
  channel: "web" | "openai" | "anthropic";
  inputTokens?: number;
  outputTokens?: number;
  neurons?: number;
  status: "ok" | "error";
  latencyMs?: number;
}) {
  const inputTokens = input.inputTokens ?? 0;
  const outputTokens = input.outputTokens ?? 0;

  // 计算 credits（失败的调用也计费，模型返回 error 仍消耗资源）
  const creditsUsed = await calculateCredits(
    input.model,
    inputTokens,
    outputTokens,
    input.neurons,
    input.task, // 传递 task 用于识别图像模型
  );

  // 只有成功的调用才扣费（Phase C 修正：error 不扣费）
  if (input.status === "ok" && creditsUsed > 0) {
    // 扣减用户余额
    await db
      .update(users)
      .set({
        balanceCredits: sql`${users.balanceCredits} - ${creditsUsed}`,
      })
      .where(eq(users.id, input.userId));

    // 扣减令牌额度（如果有限制）
    if (input.apiKeyId) {
      const keyRows = await db
        .select({ remainCredits: apiKeys.remainCredits })
        .from(apiKeys)
        .where(eq(apiKeys.id, input.apiKeyId))
        .limit(1);

      if (keyRows[0] && keyRows[0].remainCredits !== null) {
        const newRemain = keyRows[0].remainCredits - creditsUsed;
        await db
          .update(apiKeys)
          .set({
            remainCredits: newRemain,
            status: newRemain <= 0 ? 4 : undefined, // 额度耗尽→status=4
            lastUsedAt: new Date(),
          })
          .where(eq(apiKeys.id, input.apiKeyId));
      } else {
        // 无限额度令牌，仅更新 lastUsedAt
        await db
          .update(apiKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(apiKeys.id, input.apiKeyId));
      }
    }
  }

  // 记录用量
  await db.insert(usageLogs).values({
    userId: input.userId,
    apiKeyId: input.apiKeyId,
    model: input.model,
    task: input.task,
    source: input.source,
    channel: input.channel,
    inputTokens,
    outputTokens,
    neurons: input.neurons ?? 0,
    creditsUsed,
    costUsd: 0, // legacy, 不再使用
    status: input.status,
    latencyMs: input.latencyMs,
  });
}

/**
 * 校验用户余额和令牌额度是否充足（调用前置检查）。
 * 返回 { ok: true } 或 { ok: false, reason: string }。
 */
export async function verifyBalance(
  userId: string,
  apiKeyId: string | undefined,
  estimatedCredits: number,
): Promise<{ ok: boolean; reason?: string }> {
  // 查用户余额
  const userRows = await db
    .select({ balanceCredits: users.balanceCredits })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRows[0] || userRows[0].balanceCredits < estimatedCredits) {
    return { ok: false, reason: "Insufficient balance" };
  }

  // 查令牌额度（如果有限制）
  if (apiKeyId) {
    const keyRows = await db
      .select({ remainCredits: apiKeys.remainCredits })
      .from(apiKeys)
      .where(eq(apiKeys.id, apiKeyId))
      .limit(1);

    if (
      keyRows[0] &&
      keyRows[0].remainCredits !== null &&
      keyRows[0].remainCredits < estimatedCredits
    ) {
      return { ok: false, reason: "API key quota exhausted" };
    }
  }

  return { ok: true };
}

/** 获取当前登录用户 ID，未登录抛错。 */
export async function requireUser(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user.id;
}
