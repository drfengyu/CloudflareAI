import { NextRequest } from "next/server";
import { z } from "zod";
import { openaiCompatible } from "@/lib/cloudflare/ai";
import { requireUser, logUsage } from "@/lib/usage/meter";

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
 * 站内文本生成 playground，调用 CF `/ai/v1/chat/completions`（OpenAI 兼容）。
 * 支持流式（SSE）和非流式。记录用量到 usage_log。
 */
export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const body = await req.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { model, messages, stream = true, temperature, max_tokens } = parsed.data;
  const start = Date.now();

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
        model,
        task: "Text Generation",
        channel: "web",
        status: "error",
        latencyMs: Date.now() - start,
      });
      return Response.json({ error: text || "Model run failed" }, { status: res.status });
    }

    if (stream) {
      // 流式：直接透传 SSE body，结束后异步记账（简化版，实际应在流结束时计量）
      logUsage({
        userId,
        model,
        task: "Text Generation",
        channel: "web",
        status: "ok",
        latencyMs: Date.now() - start,
      }).catch(console.error);

      return new Response(res.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // 非流式：解析 JSON 并记账
    const data = await res.json();
    const usage = data.usage || {};
    await logUsage({
      userId,
      model,
      task: "Text Generation",
      channel: "web",
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      status: "ok",
      latencyMs: Date.now() - start,
    });

    return Response.json(data);
  } catch (err) {
    await logUsage({
      userId,
      model,
      task: "Text Generation",
      channel: "web",
      status: "error",
      latencyMs: Date.now() - start,
    });
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
