import { NextRequest } from "next/server";
import { z } from "zod";
import { runModelBinary } from "@/lib/cloudflare/ai";
import { requireUser, logUsage } from "@/lib/usage/meter";

const schema = z.object({
  model: z.string(),
  prompt: z.string().min(1),
  num_steps: z.number().min(1).max(50).optional(),
  guidance: z.number().min(0).max(20).optional(),
});

/**
 * POST /api/ai/image
 * 文生图：提示词 → PNG 图像（返回 base64 data URL）
 */
export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const body = await req.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { model, prompt, num_steps, guidance } = parsed.data;
  const start = Date.now();

  try {
    const res = await runModelBinary(
      model,
      { prompt, num_steps, guidance },
      req.signal,
    );

    const blob = await res.blob();
    const buffer = await blob.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;

    await logUsage({
      userId,
      model,
      task: "Text-to-Image",
      channel: "web",
      status: "ok",
      latencyMs: Date.now() - start,
    });

    return Response.json({ image: dataUrl });
  } catch (err) {
    await logUsage({
      userId,
      model,
      task: "Text-to-Image",
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
