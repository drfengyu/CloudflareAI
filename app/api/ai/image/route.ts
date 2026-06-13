import { NextRequest } from "next/server";
import { z } from "zod";
import { runModelBinary } from "@/lib/cloudflare/ai";
import { requireUser, logUsage, verifyBalance } from "@/lib/usage/meter";
import { calculateCredits } from "@/lib/billing/pricing";

const schema = z.object({
  model: z.string(),
  prompt: z.string().min(1),
  num_steps: z.number().min(1).max(50).optional(),
  guidance: z.number().min(0).max(20).optional(),
});

/**
 * POST /api/ai/image
 * 文生图（Phase B: 加入余额校验 + 真实扣费）
 */
export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const body = await req.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { model, prompt, num_steps, guidance } = parsed.data;

  // 余额预检（图像生成固定价格）
  const estimatedCredits = await calculateCredits(model, 0, 0, undefined, "Text-to-Image");

  const balanceCheck = await verifyBalance(userId, undefined, estimatedCredits);
  if (!balanceCheck.ok) {
    return Response.json({ error: balanceCheck.reason }, { status: 402 });
  }

  const start = Date.now();

  try {
    const res = await runModelBinary(
      model,
      { prompt, num_steps, guidance },
      req.signal,
    );

    // 读取 Cloudflare 返回的 neurons 消耗
    const neuronsHeader = res.headers.get("x-cf-ai-usage-neurons");
    const neuronsUsed = parseFloat(neuronsHeader || "0");
    console.log(`[image] model=${model}, neurons header="${neuronsHeader}", parsed=${neuronsUsed}`);

    const blob = await res.blob();
    const buffer = await blob.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;

    await logUsage({
      userId,
      model,
      task: "Text-to-Image",
      channel: "web",
      inputTokens: Math.floor(prompt.length * 1.5),
      outputTokens: 1, // 1 image generated
      neurons: neuronsUsed, // 真实的 neurons 消耗（可能为0）
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
