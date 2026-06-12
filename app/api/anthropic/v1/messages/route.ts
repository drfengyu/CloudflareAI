import { NextRequest } from "next/server";
import { z } from "zod";
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
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
  max_tokens: z.number().min(1),
  stream: z.boolean().optional(),
  temperature: z.number().min(0).max(1).optional(),
  system: z.string().optional(),
});

/**
 * POST /api/anthropic/v1/messages
 * Anthropic 兼容端点：供 Claude Code / Codex 等工具调用。
 * 内部转换为 OpenAI 格式调用 Cloudflare，再转回 Anthropic 格式返回。
 */
export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("x-api-key") || req.headers.get("authorization"));
  if (!token) {
    return Response.json({ error: { type: "authentication_error", message: "Missing API key" } }, { status: 401 });
  }

  const userId = await verifyApiKey(token);
  if (!userId) {
    return Response.json({ error: { type: "authentication_error", message: "Invalid API key" } }, { status: 401 });
  }

  // 限流：每用户每分钟 60 次请求
  if (!checkRateLimit(`anthropic:${userId}`, { window: 60_000, limit: 60 })) {
    return Response.json({ error: { type: "rate_limit_error", message: "Rate limit exceeded" } }, { status: 429 });
  }

  const hash = require("node:crypto")
    .createHash("sha256")
    .update(token)
    .digest("hex");
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
      { error: { type: "invalid_request_error", message: "Invalid request" } },
      { status: 400 },
    );
  }

  const { model, messages, max_tokens, stream = false, temperature, system } = parsed.data;
  const start = Date.now();

  // 转换为 OpenAI 格式
  const openaiMessages = system
    ? [{ role: "system", content: system }, ...messages]
    : messages;

  try {
    const res = await openaiCompatible(
      "chat/completions",
      { model, messages: openaiMessages, max_tokens, stream, temperature },
      req.signal,
    );

    if (!res.ok) {
      const text = await res.text();
      await logUsage({
        userId,
        apiKeyId,
        model,
        task: "Text Generation",
        channel: "anthropic",
        status: "error",
        latencyMs: Date.now() - start,
      });
      return Response.json(
        { error: { type: "api_error", message: text || "Model run failed" } },
        { status: res.status },
      );
    }

    if (stream) {
      // 流式：透传（简化版，实际应转换为 Anthropic SSE 格式）
      logUsage({
        userId,
        apiKeyId,
        model,
        task: "Text Generation",
        channel: "anthropic",
        status: "ok",
        latencyMs: Date.now() - start,
      }).catch(console.error);

      return new Response(res.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "anthropic-version": "2023-06-01",
        },
      });
    }

    // 非流式：转换为 Anthropic 格式
    const data = await res.json();
    const choice = data.choices?.[0];
    const usage = data.usage || {};

    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Text Generation",
      channel: "anthropic",
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      status: "ok",
      latencyMs: Date.now() - start,
    });

    return Response.json({
      id: data.id || `msg-${Date.now()}`,
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: choice?.message?.content || "" }],
      model,
      stop_reason: choice?.finish_reason === "stop" ? "end_turn" : "max_tokens",
      usage: {
        input_tokens: usage.prompt_tokens || 0,
        output_tokens: usage.completion_tokens || 0,
      },
    });
  } catch (err) {
    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Text Generation",
      channel: "anthropic",
      status: "error",
      latencyMs: Date.now() - start,
    });
    return Response.json(
      { error: { type: "api_error", message: err instanceof Error ? err.message : "Unknown error" } },
      { status: 500 },
    );
  }
}
