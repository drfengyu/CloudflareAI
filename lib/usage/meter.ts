import { auth } from "@/auth";
import { db } from "@/lib/db/d1-http";
import { usageLogs } from "@/lib/db/schema";

/**
 * 用量记账：每次 AI 调用后写入 usage_log + 更新 api_key.lastUsedAt。
 * P3 站内调用传 channel="web"，P5 API 网关传 "openai" | "anthropic"。
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
  costUsd?: number;
  status: "ok" | "error";
  latencyMs?: number;
}) {
  await db.insert(usageLogs).values({
    userId: input.userId,
    apiKeyId: input.apiKeyId,
    model: input.model,
    task: input.task,
    source: input.source,
    channel: input.channel,
    inputTokens: input.inputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
    neurons: input.neurons ?? 0,
    costUsd: input.costUsd ?? 0,
    status: input.status,
    latencyMs: input.latencyMs,
  });
}

/** 获取当前登录用户 ID，未登录抛错。 */
export async function requireUser(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user.id;
}
