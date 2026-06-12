import { NextRequest } from "next/server";
import { z } from "zod";
import { runModelJSON } from "@/lib/cloudflare/ai";
import { extractBearerToken, verifyApiKey } from "@/lib/auth/api-key";
import { logUsage } from "@/lib/usage/meter";
import { db } from "@/lib/db/d1-http";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const schema = z.object({
  model: z.string(),
  input: z.union([z.string(), z.array(z.string())]),
});

/**
 * POST /api/openai/v1/embeddings
 * OpenAI 兼容嵌入端点
 */
export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }

  const userId = await verifyApiKey(token);
  if (!userId) {
    return Response.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }

  const hash = require("node:crypto")
    .createHash("sha256")
    .update(token)
    .digest("hex");
  const apiKeyRows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .limit(1);
  const apiKeyId = apiKeyRows[0]?.id;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { model, input } = parsed.data;
  const start = Date.now();

  try {
    const result = await runModelJSON<{ data: Array<{ embedding: number[] }> }>(
      model,
      { text: input },
      req.signal,
    );

    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Embeddings",
      channel: "openai",
      status: "ok",
      latencyMs: Date.now() - start,
    });

    // 转换为 OpenAI 格式
    return Response.json({
      object: "list",
      data: result.data.map((d, i) => ({
        object: "embedding",
        embedding: d.embedding,
        index: i,
      })),
      model,
      usage: {
        prompt_tokens: Array.isArray(input) ? input.length : 1,
        total_tokens: Array.isArray(input) ? input.length : 1,
      },
    });
  } catch (err) {
    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Embeddings",
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
