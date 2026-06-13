import { NextRequest } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { openaiCompatible } from "@/lib/cloudflare/ai";
import { extractBearerToken, verifyApiKey } from "@/lib/auth/api-key";
import { logUsage } from "@/lib/usage/meter";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db/d1-http";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const schema = z.object({
  model: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    }),
  ),
  stream: z.boolean().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(1).optional(),
});

/**
 * POST /api/openai/v1/chat/completions
 * OpenAI 兼容端点：供 Claude Code / Codex / Hermes 调用 Cloudflare 模型。
 * 鉴权：Authorization: Bearer sk-cfai-xxxxx
 */
export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }

  const userId = await verifyApiKey(token);
  if (!userId) {
    return Response.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }

  // 限流：每用户每分钟 60 次请求
  if (!checkRateLimit(`openai:${userId}`, { window: 60_000, limit: 60 })) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // 查找 API key ID（用于记账）
  const hash = createHash("sha256").update(token).digest("hex");
  const apiKeyRows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .limit(1);
  const apiKeyId = apiKeyRows[0]?.id;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { model, messages, stream = false, temperature, max_tokens } = parsed.data;
  const start = Date.now();

  try {
    const res = await openaiCompatible(
      "chat/completions",
      { model, messages, stream, temperature, max_tokens },
      req.signal,
    );

    if (!res.ok) {
      const text = await res.text();
      await logUsage({
        userId,
        apiKeyId,
        model,
        task: "Text Generation",
        channel: "openai",
        status: "error",
        latencyMs: Date.now() - start,
      });
      return Response.json({ error: text || "Model run failed" }, { status: res.status });
    }

    if (stream) {
      // 流式透传
      logUsage({
        userId,
        apiKeyId,
        model,
        task: "Text Generation",
        channel: "openai",
        status: "ok",
        latencyMs: Date.now() - start,
      }).catch(console.error);

      return new Response(res.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }

    // 非流式
    const data = await res.json();
    const usage = data.usage || {};
    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Text Generation",
      channel: "openai",
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      status: "ok",
      latencyMs: Date.now() - start,
    });

    return Response.json(data);
  } catch (err) {
    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Text Generation",
      channel: "openai",
      status: "error",
      latencyMs: Date.now() - start,
    });
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
