import { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { openaiCompatible } from "@/lib/cloudflare/ai";
import { extractBearerToken, verifyApiKey } from "@/lib/auth/api-key";
import { logUsage, verifyBalance } from "@/lib/usage/meter";
import { calculateCredits } from "@/lib/billing/pricing";
import { checkRateLimit } from "@/lib/rate-limit";
import { interceptOpenAIStream } from "@/lib/usage/stream-intercept";

// Anthropic Messages API content 可以是纯字符串或 content block 数组（多模态 / tool_use / tool_result）。
// 仅提取文本用于：余额估算 + 转 OpenAI 时构造 message.content。
const contentBlock = z.object({ type: z.string().optional(), text: z.string().optional() }).passthrough();
const messageContent = z.union([z.string(), z.array(z.union([contentBlock, z.string()]))]);

const schema = z.object({
  model: z.string(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: messageContent,
      }),
    )
    .min(1),
  // max_tokens 在 Anthropic 规范里是必填，但客户端偶尔不发 → 缺省给 4096 占位估算。
  max_tokens: z.number().min(1).default(4096),
  stream: z.boolean().optional(),
  temperature: z.number().min(0).max(1).optional(),
  // system 可为字符串或 content block 数组（带 cache_control 等）。
  system: z.union([z.string(), z.array(contentBlock)]).optional(),
  // 透传字段：Anthropic 客户端常带这些，但我们不识别时不能直接 400。
  metadata: z.unknown().optional(),
  stop_sequences: z.array(z.string()).optional(),
  top_p: z.number().min(0).max(1).optional(),
  top_k: z.number().min(0).optional(),
  tools: z.array(z.unknown()).optional(),
  tool_choice: z.unknown().optional(),
}).passthrough();

/**
 * POST /v1/messages
 * Anthropic 兼容端点：供 Claude Code / Codex 等工具调用。
 * Phase B: 增强鉴权 + 余额校验 + 真实计量。
 */
export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("x-api-key") || req.headers.get("authorization"));
  if (!token) {
    return Response.json({ error: { type: "authentication_error", message: "Missing API key" } }, { status: 401 });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const verified = await verifyApiKey(token, clientIp);
  if (!verified) {
    return Response.json({ error: { type: "authentication_error", message: "Invalid API key" } }, { status: 401 });
  }

  const { userId, apiKeyId, allowedModels } = verified;

  // 限流：每用户每分钟 60 次请求
  if (!checkRateLimit(`anthropic:${userId}`, { window: 60_000, limit: 60 })) {
    return Response.json({ error: { type: "rate_limit_error", message: "Rate limit exceeded" } }, { status: 429 });
  }

 const body = await req.json();
 const parsed = schema.safeParse(body);
 if (!parsed.success) {
   const errorMsg = `Invalid request: ${parsed.error.issues.map(i => i.message).join('; ')}`;
   await logUsage({
     userId,
     apiKeyId,
     model: body.model || "unknown",
     task: "Text Generation",
     channel: "anthropic",
     status: "error",
     errorReason: errorMsg,
     latencyMs: Date.now() - start,
   });
   return Response.json(
     { error: { type: "invalid_request_error", message: "Invalid request" } },
     { status: 400 },
   );
 }

  const { model, messages, max_tokens, stream = false, temperature, system } = parsed.data;

  // content 可能是字符串或 content block 数组 → 展平为纯文本（仅取 text 部分）。
  const flatten = (content: unknown): string => {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((b) => (typeof b === "string" ? b : typeof b?.text === "string" ? b.text : ""))
        .join("");
    }
    return "";
  };

  const flatMessages = messages.map((m) => ({ role: m.role, content: flatten(m.content) }));
  const systemText = system ? flatten(system) : undefined;

  // 模型白名单检查
  if (allowedModels && !allowedModels.includes(model)) {
    return Response.json({ error: { type: "permission_error", message: "Model not allowed" } }, { status: 403 });
  }

  // 余额预检
  const estimatedInput = flatMessages.reduce((sum, m) => sum + m.content.length, 0) * 1.5;
  const estimatedCredits = await calculateCredits(model, estimatedInput, max_tokens);
  const balanceCheck = await verifyBalance(userId, apiKeyId, estimatedCredits);
  if (!balanceCheck.ok) {
    return Response.json({ error: { type: "insufficient_balance", message: balanceCheck.reason } }, { status: 402 });
  }

  const start = Date.now();

  try {
    // 转 OpenAI 格式
    const openaiMessages = systemText
      ? [{ role: "system" as const, content: systemText }, ...flatMessages]
      : flatMessages;

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
      return Response.json({ error: { type: "api_error", message: text } }, { status: res.status });
    }

    if (stream) {
      // 流式：拦截 SSE 流，解析末尾 usage 后按真实 token 扣费。
      // 注意：这个 gateway 透传 OpenAI 格式 SSE 给客户端（route 未做 Anthropic 格式转换），
      // 所以可以直接用 OpenAI 拦截器解析 usage chunk。
      const { stream: tap, done } = interceptOpenAIStream(res.body);

      // after() 让 Vercel serverless 在响应结束后保持函数运行直到 logUsage 完成。
      after(async () => {
        const { usage } = await done;
        await logUsage({
          userId,
          apiKeyId,
          model,
          task: "Text Generation",
          channel: "anthropic",
          inputTokens: usage?.promptTokens ?? Math.floor(estimatedInput),
          outputTokens: usage?.completionTokens ?? 0,
          status: "ok",
          latencyMs: Date.now() - start,
        });
      });

      return new Response(tap, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
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
      channel: "anthropic",
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      status: "ok",
      latencyMs: Date.now() - start,
    });

    // 转回 Anthropic 格式
    const message = data.choices?.[0]?.message || {};
    // 兼容不同模型的内容字段：部分模型（如智谱 glm 系列）使用 reasoning_content
    const textContent = message.content || message.reasoning_content || "";
    return Response.json({
      id: data.id,
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: textContent }],
      model: data.model,
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
