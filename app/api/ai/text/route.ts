import { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { openaiCompatible } from "@/lib/cloudflare/ai";
import { requireUser, logUsage, verifyBalance, getDefaultApiKey } from "@/lib/usage/meter";
import { calculateCredits } from "@/lib/billing/pricing";
import { saveConversation } from "@/lib/usage/conversation";
import { interceptOpenAIStream } from "@/lib/usage/stream-intercept";
import { routeToChannel, getChannelConfig } from "@/lib/channels/router";
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
  max_tokens: z.number().min(1).max(32768).optional(),
});

/**
 * POST /api/ai/text
 * 站内文本生成 playground（Phase B: 加入余额校验 + 真实扣费）。
 */
export async function POST(req: NextRequest) {
  const start = Date.now();
  const userId = await requireUser();
  const apiKeyId = await getDefaultApiKey(userId);

  // 必须有 API Key 才能调用
  if (!apiKeyId) {
    return Response.json(
      { error: "No API key available. Please create an API key first at /keys" },
      { status: 403 }
    );
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
     channel: "web",
     status: "error",
     errorReason: errorMsg,
     latencyMs: Date.now() - start,
   });
   return Response.json(
     { error: "Invalid request", details: parsed.error.issues },
     { status: 400 },
   );
 }

  const { model, messages, stream = true, temperature, max_tokens } = parsed.data;

  // 渠道路由：如果 API Key 绑定了非 Cloudflare 渠道，转发到对应上游
  const keyChRows = await db
    .select({ channelId: apiKeys.channelId })
    .from(apiKeys)
    .where(eq(apiKeys.id, apiKeyId!))
    .limit(1);
  const chId = keyChRows[0]?.channelId ?? null;
  if (chId) {
    const chCfg = await getChannelConfig(chId);
    if (chCfg && chCfg.type !== 'cloudflare') {
      // 重新构造请求（原始 request body 已被读取）
      const forwardBody = JSON.stringify(parsed.data);
      const forwardReq = new Request(req.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: forwardBody,
      });
      const chResp = await routeToChannel(chId, '/chat/completions', forwardReq);
      if (chResp) {
        const isStream = parsed.data.stream;

        // 流式：经 interceptOpenAIStream 拦截，结束后用真实 usage 计量并保存对话
        if (isStream && chResp.body) {
          if (!chResp.ok) {
            // 上游流式接口返回错误（HTTP != 200），通常 body 是 JSON 错误消息而非 SSE
            const upstreamText = await chResp.text();
            after(() => {
              void logUsage({
                userId,
                apiKeyId: apiKeyId!,
                model,
                task: "Text Generation",
                channel: "web",
                channelId: chId,
                status: "error",
                errorReason: upstreamText.slice(0, 500) || `Upstream error (${chResp.status})`,
                latencyMs: Date.now() - start,
              });
            });
            try {
              const j = JSON.parse(upstreamText);
              const errMsg =
                (typeof j.error === "string" ? j.error : null) ||
                (j.error as Record<string, unknown>)?.message ||
                `Upstream error (${chResp.status})`;
              return Response.json({ error: errMsg }, { status: chResp.status });
            } catch {
              return Response.json(
                { error: upstreamText || `Upstream error (${chResp.status})` },
                { status: chResp.status },
              );
            }
          }

          const { stream: tap, done } = interceptOpenAIStream(chResp.body);
          after(async () => {
            const { usage, content } = await done;
            const inputTokens = usage?.promptTokens ?? 0;
            const outputTokens = usage?.completionTokens ?? 0;
            const creditsUsed = await calculateCredits(model, inputTokens, outputTokens);

            await logUsage({
              userId,
              apiKeyId: apiKeyId!,
              model,
              task: "Text Generation",
              channel: "web",
              channelId: chId,
              inputTokens,
              outputTokens,
              status: "ok",
              latencyMs: Date.now() - start,
            });

            const userMessage = messages.findLast((m) => m.role === "user");
            if (userMessage && content) {
              await saveConversation({
                userId,
                model,
                prompt: userMessage.content,
                response: content,
                inputTokens,
                outputTokens,
                creditsUsed,
              });
            }
          });

          return new Response(tap, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "X-Accel-Buffering": "no",
              Connection: "keep-alive",
            },
          });
        }

        // 非流式：解析 JSON 返回
        const upstreamText = await chResp.text();
        let upstreamJson: Record<string, unknown>;
        try {
          upstreamJson = JSON.parse(upstreamText);
        } catch {
          after(() => {
            void logUsage({
              userId,
              apiKeyId: apiKeyId!,
              model,
              task: "Text Generation",
              channel: "web",
              channelId: chId,
              status: chResp.ok ? "ok" : "error",
              errorReason: chResp.ok ? undefined : upstreamText.slice(0, 500),
              latencyMs: Date.now() - start,
            });
          });
          return new Response(upstreamText, {
            status: chResp.status,
            headers: { "Content-Type": chResp.headers.get("Content-Type") || "text/plain" },
          });
        }
        if (!chResp.ok) {
          const errMsg =
            (upstreamJson.error as string) ||
            ((upstreamJson.error as Record<string, unknown>)?.message as string) ||
            `Upstream error (${chResp.status})`;
          after(() => {
            void logUsage({
              userId,
              apiKeyId: apiKeyId!,
              model,
              task: "Text Generation",
              channel: "web",
              channelId: chId,
              status: "error",
              errorReason: errMsg,
              latencyMs: Date.now() - start,
            });
          });
          return Response.json({ error: errMsg }, { status: chResp.status });
        }

        // 非流式成功：用上游 usage 真实计量 + 保存对话
        const usage = (upstreamJson.usage as Record<string, number>) || {};
        const inputTokens = usage.prompt_tokens || 0;
        const outputTokens = usage.completion_tokens || 0;
        const creditsUsed = await calculateCredits(model, inputTokens, outputTokens);

        after(async () => {
          await logUsage({
            userId,
            apiKeyId: apiKeyId!,
            model,
            task: "Text Generation",
            channel: "web",
            channelId: chId,
            inputTokens,
            outputTokens,
            status: "ok",
            latencyMs: Date.now() - start,
          });

          const userMessage = messages.findLast((m) => m.role === "user");
          // 兼容 OpenAI content 与推理模型 reasoning_content
          const choice = (upstreamJson.choices as Array<Record<string, any>>)?.[0];
          const assistantMessage =
            (choice?.message?.content as string | undefined) ||
            (choice?.message?.reasoning_content as string | undefined);
          if (userMessage && assistantMessage) {
            await saveConversation({
              userId,
              model,
              prompt: userMessage.content,
              response: assistantMessage,
              inputTokens,
              outputTokens,
              creditsUsed,
            });
          }
        });
        return Response.json(upstreamJson);
      }
    }
  }

  // 余额预检（粗略估算）
  const estimatedInput = messages.reduce((sum, m) => sum + m.content.length, 0) * 1.5;
  const estimatedOutput = max_tokens || 2048;
  const estimatedCredits = await calculateCredits(model, estimatedInput, estimatedOutput);

  const balanceCheck = await verifyBalance(userId, apiKeyId, estimatedCredits);
  if (!balanceCheck.ok) {
    return Response.json({ error: balanceCheck.reason }, { status: 402 });
  }

  try {
    const res = await openaiCompatible(
      "chat/completions",
      {
        model,
        messages,
        stream,
        temperature,
        max_tokens,
      },
      req.signal,
    );

    if (!res.ok) {
      const text = await res.text();
      await logUsage({
        userId,
        apiKeyId,
        model,
        task: "Text Generation",
        channel: "web",
        status: "error",
        errorReason: text || "Model run failed",
        latencyMs: Date.now() - start,
      });
      return Response.json({ error: text || "Model run failed" }, { status: res.status });
    }

    if (stream) {
      // 流式：拦截 SSE，结束后用真实 token 数计量 + 保存对话历史。
      const { stream: tap, done } = interceptOpenAIStream(res.body);

      // after() 让 Vercel serverless 在响应结束后保持运行直到完成 logUsage 和 saveConversation。
      after(async () => {
        const { usage, content } = await done;
        const inputTokens = usage?.promptTokens ?? Math.floor(estimatedInput);
        const outputTokens = usage?.completionTokens ?? 0;
        const creditsUsed = await calculateCredits(model, inputTokens, outputTokens);

        await logUsage({
          userId,
          apiKeyId,
          model,
          task: "Text Generation",
          channel: "web",
          inputTokens,
          outputTokens,
          status: "ok",
          latencyMs: Date.now() - start,
        });

        // 保存对话历史：流式时也能拿到拼接后的 content
        const userMessage = messages.findLast((m) => m.role === "user");
        if (userMessage && content) {
          await saveConversation({
            userId,
            model,
            prompt: userMessage.content,
            response: content,
            inputTokens,
            outputTokens,
            creditsUsed,
          });
        }
      });

      return new Response(tap, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // 非流式：真实 token 数计量
    const data = await res.json();
    const usage = data.usage || {};
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;

    const creditsUsed = await calculateCredits(model, inputTokens, outputTokens);

    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Text Generation",
      channel: "web",
      inputTokens,
      outputTokens,
      status: "ok",
      latencyMs: Date.now() - start,
    });

    // 保存对话历史（仅非流式，因为流式我们无法获取完整 response）
    const userMessage = messages.findLast((m) => m.role === "user");
    const assistantMessage = data.choices?.[0]?.message?.content;
    if (userMessage && assistantMessage) {
      saveConversation({
        userId,
        model,
        prompt: userMessage.content,
        response: assistantMessage,
        inputTokens,
        outputTokens,
        creditsUsed,
      }).catch(console.error); // 不阻塞响应
    }

    return Response.json(data);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Text Generation",
      channel: "web",
      status: "error",
      errorReason: errMsg,
      latencyMs: Date.now() - start,
    });
    return Response.json(
      { error: errMsg },
      { status: 500 },
    );
  }
}
