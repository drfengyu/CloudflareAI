import { NextRequest } from "next/server";
import { z } from "zod";
import { runModelJSON } from "@/lib/cloudflare/ai";
import { requireUser, logUsage, verifyBalance, getDefaultApiKey } from "@/lib/usage/meter";
import { calculateCredits } from "@/lib/billing/pricing";
import { estimateTokens } from "@/lib/usage/tokens";

const schema = z.object({
  model: z.string(),
  prompt: z.string().min(1),
  image: z.string(), // base64 data URL
  max_tokens: z.number().min(1).max(4096).optional(),
});

// 视觉模型图像本身消耗的输入 token（patch token）。llava-1.5 约 576，作为统一近似值。
const IMAGE_INPUT_TOKENS = 576;

/**
 * POST /api/ai/vision
 * 图像理解（Phase B: 加入余额校验 + 真实扣费）
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

  const { model, prompt, image, max_tokens } = parsed.data;

  // 输入 token = prompt 估算 + 图像 patch token（图像才是 vision 输入的大头）。
  const inputTokens = estimateTokens(prompt) + IMAGE_INPUT_TOKENS;
  // 预检按 max_tokens 上限保守估算输出；真正计费用实际返回文本。
  const estimatedOutput = max_tokens || 512;
  const estimatedCredits = await calculateCredits(model, inputTokens, estimatedOutput);

  const balanceCheck = await verifyBalance(userId, apiKeyId, estimatedCredits);
  if (!balanceCheck.ok) {
    return Response.json({ error: balanceCheck.reason }, { status: 402 });
  }

  const start = Date.now();

  try {
    // Cloudflare llava-1.5-7b-hf 需要 u8 字节数组（每个字节 0-255 的数字），
    // 不是 base64 字符串。先剥离 data URL 前缀，再解码为字节数组。
    const base64 = image.includes(",") ? image.split(",")[1] : image;
    let imageBytes: number[];
    try {
      const binaryString = atob(base64);
      imageBytes = Array.from(binaryString, (c) => c.charCodeAt(0));
    } catch {
      return Response.json(
        { error: "Invalid image data: not valid base64" },
        { status: 400 },
      );
    }

    const result = await runModelJSON<{ response?: string; description?: string }>(
      model,
      {
        prompt,
        image: imageBytes,
        max_tokens,
      },
      req.signal,
    );

    const outputText = result.description || result.response || "";
    // 视觉模型不返回 usage，按实际返回文本估算输出 token（而非 max_tokens 上限）。
    const outputTokens = estimateTokens(outputText);

    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Image Understanding",
      channel: "web",
      inputTokens,
      outputTokens,
      status: "ok",
      latencyMs: Date.now() - start,
    });

    return Response.json({ text: outputText });
  } catch (err) {
    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Image Understanding",
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
