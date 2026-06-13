import { NextRequest } from "next/server";
import { z } from "zod";
import { openaiCompatible } from "@/lib/cloudflare/ai";
import { requireUser, logUsage, verifyBalance } from "@/lib/usage/meter";
import { calculateCredits } from "@/lib/billing/pricing";

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

  // 余额预检（粗略估算）
  const estimatedInput = messages.reduce((sum, m) => sum + m.content.length, 0) * 1.5;
  const estimatedOutput = max_tokens || 2048;
  const estimatedCredits = await calculateCredits(model, estimatedInput, estimatedOutput);

  const balanceCheck = await verifyBalance(userId, undefined, estimatedCredits);
  if (!balanceCheck.ok) {
    return Response.json({ error: balanceCheck.reason }, { status: 402 });
  }

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
      // 流式：先扣预估（Phase C 实现流式结束修正）
      logUsage({
        userId,
        model,
        task: "Text Generation",
        channel: "web",
        inputTokens: Math.floor(estimatedInput),
        outputTokens: estimatedOutput,
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

    // 非流式：真实 token 数计量
    const data = await res.json();
    const usage = data.usage || {};
    await logUsage({
      userId,
      model,
      task: "Text Generation",
      channel: "web",
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
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
