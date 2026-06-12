import { NextRequest } from "next/server";
import { z } from "zod";
import { runModelJSON } from "@/lib/cloudflare/ai";
import { requireUser, logUsage } from "@/lib/usage/meter";

const schema = z.object({
  model: z.string(),
  prompt: z.string().min(1),
  image: z.string(), // base64 data URL
  max_tokens: z.number().min(1).max(4096).optional(),
});

/**
 * POST /api/ai/vision
 * 图像理解：上传图片 + 提问 → 文本回答（使用 vision 模型）
 */
export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const body = await req.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { model, prompt, image, max_tokens } = parsed.data;
  const start = Date.now();

  try {
    const result = await runModelJSON<{ response: string }>(
      model,
      {
        prompt,
        image: [image.split(",")[1]], // strip data URL prefix, send base64 array
        max_tokens,
      },
      req.signal,
    );

    await logUsage({
      userId,
      model,
      task: "Image Understanding",
      channel: "web",
      status: "ok",
      latencyMs: Date.now() - start,
    });

    return Response.json({ text: result.response || "" });
  } catch (err) {
    await logUsage({
      userId,
      model,
      task: "Image Understanding",
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
