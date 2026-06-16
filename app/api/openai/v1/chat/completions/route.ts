import { NextRequest } from "next/server";
import { z } from "zod";
import { openaiCompatible } from "@/lib/cloudflare/ai";
import { extractBearerToken, verifyApiKey } from "@/lib/auth/api-key";
import { logUsage, verifyBalance } from "@/lib/usage/meter";
import { calculateCredits } from "@/lib/billing/pricing";
import { checkRateLimit } from "@/lib/rate-limit";
import { interceptOpenAIStream } from "@/lib/usage/stream-intercept";

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
 * Phase B: 校验状态/有效期/IP/模型白名单 + 余额前置检查 + 真实扣费计量。
 */
export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const verified = await verifyApiKey(token, clientIp);
  if (!verified) {
    return Response.json({ error: "Invalid or unauthorized API key" }, { status: 401 });
  }

  const { userId, apiKeyId, allowedModels } = verified;

  // 限流：每用户每分钟 60 次请求
  if (!checkRateLimit(`openai:${userId}`, { window: 60_000, limit: 60 })) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { model, messages, stream = false, temperature, max_tokens } = parsed.data;

  // 模型白名单检查
  if (allowedModels && !allowedModels.includes(model)) {
    return Response.json({ error: "Model not allowed for this API key" }, { status: 403 });
  }

  // 余额预检（粗略估算：输入按消息总长*1.5，输出按max_tokens或默认512）
  const estimatedInput = messages.reduce((sum, m) => sum + m.content.length, 0) * 1.5;
  const estimatedOutput = max_tokens || 512;
  const estimatedCredits = await calculateCredits(model, estimatedInput, estimatedOutput);

  const balanceCheck = await verifyBalance(userId, apiKeyId, estimatedCredits);
  if (!balanceCheck.ok) {
    return Response.json({ error: balanceCheck.reason }, { status: 402 });
  }

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
      // 流式：拦截 SSE 流，解析末尾的 usage chunk 后再按真实 token 扣费。
      // Cloudflare 即使不传 stream_options 也会发 usage chunk，所以无需改请求体。
      const { stream: tap, done } = interceptOpenAIStream(res.body);

      // 后台等待流读完，拿到真实 usage 后才计量。
      // 注意：不能 await，否则会阻塞返回。
      done.then(async ({ usage }) => {
        await logUsage({
          userId,
          apiKeyId,
          model,
          task: "Text Generation",
          channel: "openai",
          inputTokens: usage?.promptTokens ?? Math.floor(estimatedInput),
          outputTokens: usage?.completionTokens ?? 0,
          status: "ok",
          latencyMs: Date.now() - start,
        });
      }).catch(console.error);

      return new Response(tap, {
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
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
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
