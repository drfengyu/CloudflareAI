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

  // 计算 credits。失败的调用不计费、不计入统计（creditsUsed=0），
  // 余额扣减与用量统计口径保持一致。
  const creditsUsed =
    input.status === "ok"
      ? await calculateCredits(
          input.model,
          inputTokens,
          outputTokens,
          input.neurons,
          input.task, // 传递 task 用于识别图像模型
        )
      : 0;

  // 只有成功的调用才扣费（error 已在上面记为 0 credits）
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
      .select({
        remainCredits: apiKeys.remainCredits,
        expiresAt: apiKeys.expiresAt,
        status: apiKeys.status
      })
      .from(apiKeys)
      .where(eq(apiKeys.id, apiKeyId))
      .limit(1);

    if (!keyRows[0]) {
      return { ok: false, reason: "API key not found" };
    }

    const key = keyRows[0];

    // 检查过期时间
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      // 更新状态为过期
      await db
        .update(apiKeys)
        .set({ status: 3 })
        .where(eq(apiKeys.id, apiKeyId));
      return { ok: false, reason: "API key expired" };
    }

    // 检查是否已禁用
    if (key.status === 2) {
      return { ok: false, reason: "API key disabled" };
    }

    // 检查额度
    if (
      key.remainCredits !== null &&
      key.remainCredits < estimatedCredits
    ) {
      // 更新状态为额度耗尽
      if (key.status !== 4) {
        await db
          .update(apiKeys)
          .set({ status: 4 })
          .where(eq(apiKeys.id, apiKeyId));
      }
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

/**
 * 获取用户的默认 API Key（用于 Playground web 渠道）。
 * 返回第一个启用状态（status=1）的 key ID（按创建时间最早），如果没有则返回 undefined。
 */
export async function getDefaultApiKey(userId: string): Promise<string | undefined> {
  const keys = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(sql`${apiKeys.userId} = ${userId} AND ${apiKeys.status} = 1`)
    .orderBy(apiKeys.createdAt)
    .limit(1);

  return keys[0]?.id;
}
