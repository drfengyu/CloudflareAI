import { NextRequest } from "next/server";
import { z } from "zod";
import { runModelJSON } from "@/lib/cloudflare/ai";
import { requireUser, logUsage, verifyBalance, getDefaultApiKey } from "@/lib/usage/meter";
import { calculateCredits } from "@/lib/billing/pricing";
import { estimateTokensTotal } from "@/lib/usage/tokens";

const schema = z.object({
  model: z.string(),
  text: z.union([z.string(), z.array(z.string())]),
});

/**
 * POST /api/ai/embeddings
 * 文本嵌入（Phase B: 加入余额校验 + 真实扣费）
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

  const { model, text } = parsed.data;

  // 余额预检（嵌入模型不返回真实 usage，按字符类别估算 token）
  const texts = Array.isArray(text) ? text : [text];
  const estimatedTokens = estimateTokensTotal(texts);
  const estimatedCredits = await calculateCredits(model, estimatedTokens, 0);

  const balanceCheck = await verifyBalance(userId, apiKeyId, estimatedCredits);
  if (!balanceCheck.ok) {
    return Response.json({ error: balanceCheck.reason }, { status: 402 });
  }

  const start = Date.now();

  try {
    const result = await runModelJSON<{ data: Array<{ embedding: number[] }> }>(
      model,
      { text },
      req.signal,
    );

    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Embeddings",
      channel: "web",
      inputTokens: Math.floor(estimatedTokens),
      outputTokens: 0,
      status: "ok",
      latencyMs: Date.now() - start,
    });

    return Response.json({ embeddings: result.data || [] });
  } catch (err) {
    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Embeddings",
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
