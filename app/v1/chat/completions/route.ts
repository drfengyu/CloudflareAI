import { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { openaiCompatible } from "@/lib/cloudflare/ai";
import { extractBearerToken, verifyApiKey } from "@/lib/auth/api-key";
import { logUsage, verifyBalance, estimateRequestCredits } from "@/lib/usage/meter";
import { checkRateLimit } from "@/lib/rate-limit";
import { interceptOpenAIStream, openAIResponseToSSE } from "@/lib/usage/stream-intercept";
import { routeToChannel, getChannelConfig } from "@/lib/channels/router";

// OpenAI content 可以是字符串或 content part 数组（多模态）。
const contentPart = z.object({ type: z.string().optional(), text: z.string().optional() }).passthrough();
const messageContent = z.union([z.string(), z.array(z.union([contentPart, z.string()]))]);

const schema = z.object({
  model: z.string(),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant", "tool", "developer"]),
        content: messageContent.nullable().optional(),
      }).passthrough(),
    )
    .min(1),
  stream: z.boolean().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(1).optional(),
}).passthrough();

/**
 * POST /v1/chat/completions
 * OpenAI 兼容端点：供 Claude Code / Codex / Hermes 调用 Cloudflare 模型。
 * Phase B: 校验状态/有效期/IP/模型白名单 + 余额前置检查 + 真实扣费计量。
 */
export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }
  const start = Date.now();
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const verified = await verifyApiKey(token, clientIp);
  if (!verified) {
    return Response.json({ error: "Invalid or unauthorized API key" }, { status: 401 });
  }

  const { userId, apiKeyId, allowedModels, channelId } = verified;

  // 限流：每用户每分钟 60 次请求
  if (!checkRateLimit(`openai:${userId}`, { window: 60_000, limit: 60 })) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
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
     channel: "openai",
     channelId,
     status: "error",
     errorReason: errorMsg,
     latencyMs: Date.now() - start,
   });
   return Response.json(
     { error: "Invalid request", details: parsed.error.issues },
     { status: 400 },
   );
 }

  const { model, messages, stream = false, max_tokens } = parsed.data;

  // 模型白名单检查
  if (allowedModels && !allowedModels.includes(model)) {
    return Response.json({ error: "Model not allowed for this API key" }, { status: 403 });
  }
  // 余额预检：输入按消息文本实估，输出按 min(客户端 max_tokens, 该模型预留档位)。
  const inputText = messages
    .map((m) =>
      typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((b) => (typeof b === "string" ? b : b.text ?? "")).join("")
          : "",
    )
    .join("\n");
  const precheck = await estimateRequestCredits({
    model,
    inputText,
    requestedMaxTokens: max_tokens,
    task: "Text Generation",
  });

  const balanceCheck = await verifyBalance(userId, apiKeyId, precheck.credits);
  if (!balanceCheck.ok) {
    const detail = `${balanceCheck.reason}：本次预检需要 ${precheck.credits.toFixed(2)} cr，当前可用 ${balanceCheck.availableCredits.toFixed(2)} cr`;
    after(() => {
      void logUsage({
        userId,
        apiKeyId,
        model,
        task: "Text Generation",
        channel: "openai",
        channelId,
        inputTokens: precheck.inputTokens,
        outputTokens: precheck.outputTokens,
        status: "error",
        errorReason: detail,
        latencyMs: Date.now() - start,
      });
    });
    return Response.json({ error: detail }, { status: 402 });
  }

  // 渠道路由：如果 API Key 绑定了非 Cloudflare 渠道，转发到对应上游
  if (channelId) {
    const channelConfig = await getChannelConfig(channelId);
    if (channelConfig && channelConfig.type !== "cloudflare") {
      const channelResponse = await routeToChannel(channelId, "/chat/completions", req);
      if (channelResponse) {
        // 记录用量（简化：非 Cloudflare 渠道按估算 token 计费）
        const latencyMs = Date.now() - start;
        after(() => {
          void logUsage({
            userId,
            apiKeyId,
            model,
            task: "Text Generation",
            channel: "openai",
            channelId,
            inputTokens: precheck.inputTokens,
            outputTokens: precheck.outputTokens,
            status: "ok",
            latencyMs,
          });
        });
        return channelResponse;
      }
    }
  }

  try {
    // 透传完整请求体（含 tools / tool_choice / top_p / response_format 等），
    // 而非只挑几个字段——否则 OpenAI 工具调用客户端会因 tools 被丢弃而失败。
    // Cloudflare 流式端点不返回结构化 tool_calls（序列化进 content），故有工具时
    // 强制非流式上游，再合成 OpenAI SSE 保证 tool_calls deltas。
    const rawTools = (body as { tools?: unknown }).tools;
    const hasTools = Array.isArray(rawTools) && rawTools.length > 0;
    const upstreamStream = stream && !hasTools;
    const res = await openaiCompatible(
      "chat/completions",
      { ...parsed.data, model, messages, stream: upstreamStream },
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
        channelId,
        status: "error",
        latencyMs: Date.now() - start,
      });
      return Response.json({ error: text || "Model run failed" }, { status: res.status });
    }

    if (stream && !upstreamStream) {
      // 流式 + 工具：上游已是非流式 JSON。合成 OpenAI SSE（含 tool_calls deltas）。
      const data = await res.json();
      const usage = data.usage || {};
      await logUsage({
        userId,
        apiKeyId,
        model,
        task: "Text Generation",
        channel: "openai",
        channelId,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        status: "ok",
        latencyMs: Date.now() - start,
      });
      return new Response(openAIResponseToSSE(data), {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }

    if (stream) {
      // Cloudflare 即使不传 stream_options 也会发 usage chunk，所以无需改请求体。
      // 但真实 usage 只在**终态** chunk 上：中间 chunk 的 completion_tokens 恒为 0/1
      // 占位桩，流被截断（客户端断开 / 上游 reset / 停顿）时峰值仍是桩值。
      const { stream: tap, done } = interceptOpenAIStream(res.body);

      // 用 next/server 的 after() 让 Vercel 在响应结束后继续运行（serverless
      // 默认在 response return 时立即终止函数，会让 done 的 .then() 丢失）。
      after(async () => {
        const { usage, usageFinal } = await done;
        // 两个计数不对称：prompt 在首块就被 provider 数清，截断也是真实值，照计；
        // completion 只有终态块可信（中间 chunk 恒为 0/1 占位桩），截断时记 0。
        // 两者都不臆造：既不用 chars*1.5，也不用桩值凑 output。
        const inputTokens = usage?.promptTokens ?? 0;
        const outputTokens = usageFinal ? (usage?.completionTokens ?? 0) : 0;
        // 完全没收到 usage 块 = 计量失明，必须留一条可见的 error 行；
        // 正常的客户端断开只标 reason、status 仍为 ok，不污染渠道健康度统计。
        const metered = usage !== null;
        await logUsage({
          userId,
          apiKeyId,
          model,
          task: "Text Generation",
          channel: "openai",
          channelId,
          inputTokens,
          outputTokens,
          status: metered ? "ok" : "error",
          errorReason: !metered
            ? "usage_unavailable"
            : usageFinal
              ? undefined
              : "stream_truncated",
          latencyMs: Date.now() - start,
        });
      });

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
      channelId,
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
      channelId,
      status: "error",
      latencyMs: Date.now() - start,
    });
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
