import { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { openaiCompatible } from "@/lib/cloudflare/ai";
import { extractBearerToken, verifyApiKey } from "@/lib/auth/api-key";
import { logUsage, verifyBalance } from "@/lib/usage/meter";
import { calculateCredits } from "@/lib/billing/pricing";
import { checkRateLimit } from "@/lib/rate-limit";
import { convertToAnthropicStream, anthropicMessageToSSE } from "@/lib/usage/anthropic-stream";
import {
  anthropicToOpenAIMessages,
  anthropicToolsToOpenAI,
  anthropicToolChoiceToOpenAI,
  openAIResponseToAnthropic,
  flattenAnthropicContent,
} from "@/lib/relay/anthropic";
import { routeToChannel, getChannelConfig } from "@/lib/channels/router";

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
  const start = Date.now();
  // Anthropic 使用 x-api-key（裸 token）或 authorization（Bearer token）
  const xApiKey = req.headers.get("x-api-key");
  const authHeader = req.headers.get("authorization");
  const token = xApiKey || extractBearerToken(authHeader);
  if (!token) {
    return Response.json({ error: { type: "authentication_error", message: "Missing API key" } }, { status: 401 });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const verified = await verifyApiKey(token, clientIp);
  if (!verified) {
    return Response.json({ error: { type: "authentication_error", message: "Invalid API key" } }, { status: 401 });
  }

  const { userId, apiKeyId, allowedModels, channelId } = verified;

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
     channelId,
     status: "error",
     errorReason: errorMsg,
     latencyMs: Date.now() - start,
   });
   return Response.json(
     { error: { type: "invalid_request_error", message: "Invalid request" } },
     { status: 400 },
   );
 }

  const { model, messages, max_tokens, stream = false, temperature, system, tool_choice } = parsed.data;
  // tools 走 passthrough，未在 schema 中显式取出，从 body 读原始值。
  const rawTools = (body as { tools?: unknown }).tools;

  // 模型白名单检查
  if (allowedModels && !allowedModels.includes(model)) {
    return Response.json({ error: { type: "permission_error", message: "Model not allowed" } }, { status: 403 });
  }

  // 余额预检（按消息文本估算输入）
  const estimatedInput =
    messages.reduce((sum, m) => sum + flattenAnthropicContent(m.content).length, 0) * 1.5;
  const estimatedCredits = await calculateCredits(model, estimatedInput, max_tokens);
  const balanceCheck = await verifyBalance(userId, apiKeyId, estimatedCredits);
  if (!balanceCheck.ok) {
    return Response.json({ error: { type: "insufficient_balance", message: balanceCheck.reason } }, { status: 402 });
  }

  // 渠道路由：如果 API Key 绑定了非 Cloudflare 渠道，转发到对应上游
  if (channelId) {
    const channelConfig = await getChannelConfig(channelId);
    if (channelConfig && channelConfig.type !== "cloudflare") {
      const channelResponse = await routeToChannel(channelId, "/chat/completions", req);
      if (channelResponse) {
        const latencyMs = Date.now() - start;
        after(() => {
          void logUsage({
            userId,
            apiKeyId,
            model,
            task: "Text Generation",
            channel: "anthropic",
            channelId,
            inputTokens: Math.floor(estimatedInput),
            outputTokens: max_tokens,
            status: "ok",
            latencyMs,
          });
        });
        return channelResponse;
      }
    }
  }

  try {
    // 转 OpenAI 格式：保留工具调用 / 工具结果 / 图片，而非展平为文本。
    const openaiMessages = anthropicToOpenAIMessages(messages, system);
    const openaiTools = anthropicToolsToOpenAI(rawTools);
    const openaiToolChoice = anthropicToolChoiceToOpenAI(tool_choice);

    // Cloudflare 流式端点不返回结构化 tool_calls（会序列化进 content 文本），
    // 因此有工具时强制非流式上游，再合成 Anthropic SSE 保证 tool_use 结构。
    const upstreamStream = stream && !openaiTools;

    const upstreamBody: Record<string, unknown> = {
      model,
      messages: openaiMessages,
      max_tokens,
      stream: upstreamStream,
      temperature,
    };
    if (openaiTools) upstreamBody.tools = openaiTools;
    if (openaiToolChoice !== undefined) upstreamBody.tool_choice = openaiToolChoice;

    const res = await openaiCompatible("chat/completions", upstreamBody, req.signal);

    if (!res.ok) {
      const text = await res.text();
      await logUsage({
        userId,
        apiKeyId,
        model,
        task: "Text Generation",
        channel: "anthropic",
        channelId,
        status: "error",
        errorReason: text?.slice(0, 500) || `Upstream ${res.status}`,
        latencyMs: Date.now() - start,
      });
      return Response.json({ error: { type: "api_error", message: text } }, { status: res.status });
    }

    if (stream && !upstreamStream) {
      // 流式 + 工具：上游已是非流式 JSON。转换为结构化 Anthropic message 后合成 SSE。
      const data = await res.json();
      const usage = data.usage || {};
      await logUsage({
        userId,
        apiKeyId,
        model,
        task: "Text Generation",
        channel: "anthropic",
        channelId,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        status: "ok",
        latencyMs: Date.now() - start,
      });
      const anth = openAIResponseToAnthropic(data, model);
      return new Response(anthropicMessageToSSE(anth), {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }

    if (stream) {
      const messageId = `msg_${Date.now().toString(36)}`;
      const { stream: tap, done } = convertToAnthropicStream(res.body, {
        model,
        messageId,
        inputTokens: Math.floor(estimatedInput),
      });

      // after() 让 Vercel serverless 在响应结束后保持函数运行直到 logUsage 完成。
      after(async () => {
        const { usage } = await done;
        await logUsage({
          userId,
          apiKeyId,
          model,
          task: "Text Generation",
          channel: "anthropic",
          channelId,
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
      channelId,
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      status: "ok",
      latencyMs: Date.now() - start,
    });

    // 转回 Anthropic 格式（含 tool_use block + stop_reason）
    return Response.json(openAIResponseToAnthropic(data, model));
  } catch (err) {
    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Text Generation",
      channel: "anthropic",
      channelId,
      status: "error",
      errorReason: err instanceof Error ? err.message.slice(0, 500) : "Unknown error",
      latencyMs: Date.now() - start,
    });
    return Response.json(
      { error: { type: "api_error", message: err instanceof Error ? err.message : "Unknown error" } },
      { status: 500 },
    );
  }
}
