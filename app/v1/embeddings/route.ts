import { NextRequest } from "next/server";
import { z } from "zod";
import { runModelJSON } from "@/lib/cloudflare/ai";
import { extractBearerToken, verifyApiKey } from "@/lib/auth/api-key";
import { logUsage, verifyBalance } from "@/lib/usage/meter";
import { calculateCredits } from "@/lib/billing/pricing";

const schema = z.object({
  model: z.string(),
  input: z.union([z.string(), z.array(z.string())]),
});

/**
 * POST /v1/embeddings
 * OpenAI 兼容嵌入端点（Phase B: 增强鉴权 + 计量）
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

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { model, input } = parsed.data;

  // 模型白名单检查
  if (allowedModels && !allowedModels.includes(model)) {
    return Response.json({ error: "Model not allowed for this API key" }, { status: 403 });
  }

  const texts = Array.isArray(input) ? input : [input];

  // 余额预检（按文本总长 * 1.5 估算 token）
  const estimatedTokens = texts.reduce((sum, t) => sum + t.length, 0) * 1.5;
  const estimatedCredits = await calculateCredits(model, estimatedTokens, 0);
  const balanceCheck = await verifyBalance(userId, apiKeyId, estimatedCredits);
  if (!balanceCheck.ok) {
    return Response.json({ error: balanceCheck.reason }, { status: 402 });
  }

  const start = Date.now();

  try {
    const results = await Promise.all(
      texts.map((text) => runModelJSON(model, { text })),
    );

    const embeddings = results.map((r, i) => ({
      object: "embedding",
      embedding: (r as { data?: number[][] })?.data?.[0] || [],
      index: i,
    }));

    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Text Embeddings",
      channel: "openai",
      inputTokens: Math.floor(estimatedTokens),
      outputTokens: 0,
      status: "ok",
      latencyMs: Date.now() - start,
    });

    return Response.json({
      object: "list",
      data: embeddings,
      model,
      usage: { prompt_tokens: Math.floor(estimatedTokens), total_tokens: Math.floor(estimatedTokens) },
    });
  } catch (err) {
    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Text Embeddings",
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
