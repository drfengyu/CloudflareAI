import { NextRequest } from "next/server";
import { z } from "zod";
import { runModelJSON } from "@/lib/cloudflare/ai";
import { requireUser, logUsage, verifyBalance, getDefaultApiKey } from "@/lib/usage/meter";
import { calculateCredits } from "@/lib/billing/pricing";

const schema = z.object({
  model: z.string(),
  text: z.string().min(1),
  source_lang: z.string().optional(),
  target_lang: z.string(),
});

/**
 * POST /api/ai/translate
 * 翻译（Phase B: 加入余额校验 + 真实扣费）
 */
export async function POST(req: NextRequest) {
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
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { model, text, source_lang, target_lang } = parsed.data;

  // 余额预检（翻译：输入文本长度 * 1.5，输出按输入等长估算）
  const estimatedInput = text.length * 1.5;
  const estimatedOutput = text.length * 1.5;
  const estimatedCredits = await calculateCredits(model, estimatedInput, estimatedOutput);

  const balanceCheck = await verifyBalance(userId, apiKeyId, estimatedCredits);
  if (!balanceCheck.ok) {
    return Response.json({ error: balanceCheck.reason }, { status: 402 });
  }

  const start = Date.now();

  try {
    const result = await runModelJSON<{ translated_text: string }>(
      model,
      { text, source_lang, target_lang },
      req.signal,
    );

    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Translation",
      channel: "web",
      inputTokens: Math.floor(estimatedInput),
      outputTokens: Math.floor(estimatedOutput),
      status: "ok",
      latencyMs: Date.now() - start,
    });

    return Response.json({ text: result.translated_text || "" });
  } catch (err) {
    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Translation",
      channel: "web",
      status: "error",
      errorReason: err instanceof Error ? err.message : "Unknown error",
      latencyMs: Date.now() - start,
    });
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
