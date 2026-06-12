import { NextRequest } from "next/server";
import { z } from "zod";
import { runModelJSON } from "@/lib/cloudflare/ai";
import { requireUser, logUsage } from "@/lib/usage/meter";

const schema = z.object({
  model: z.string(),
  text: z.union([z.string(), z.array(z.string())]),
});

/**
 * POST /api/ai/embeddings
 * 文本嵌入：输入文本 → 向量数组
 */
export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const body = await req.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { model, text } = parsed.data;
  const start = Date.now();

  try {
    const result = await runModelJSON<{ data: Array<{ embedding: number[] }> }>(
      model,
      { text },
      req.signal,
    );

    await logUsage({
      userId,
      model,
      task: "Embeddings",
      channel: "web",
      status: "ok",
      latencyMs: Date.now() - start,
    });

    return Response.json({ embeddings: result.data || [] });
  } catch (err) {
    await logUsage({
      userId,
      model,
      task: "Embeddings",
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
