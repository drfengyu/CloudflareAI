import { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { runModelJSON } from "@/lib/cloudflare/ai";
import { requireUser, logUsage, verifyBalance, getDefaultApiKey } from "@/lib/usage/meter";
import { calculateCredits } from "@/lib/billing/pricing";
import { estimateTokens } from "@/lib/usage/tokens";
import { lookupChannel } from "@/lib/channels/lookup";
import { routeToChannel } from "@/lib/channels/router";

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
  const start = Date.now();
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
   const errorMsg = `Invalid request: ${parsed.error.issues.map(i => i.message).join('; ')}`;
   await logUsage({
     userId,
     apiKeyId,
     model: body.model || "unknown",
     task: "Image Understanding",
     channel: "web",
     status: "error",
     errorReason: errorMsg,
     latencyMs: Date.now() - start,
   });
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

  // 渠道路由：非 Cloudflare 模型走第三方渠道
  const channel = await lookupChannel(model, apiKeyId);
  if (channel) {
    // 构建 OpenAI 兼容的 messages 格式：image 用 data URL 直接传
    const forwardBody = JSON.stringify({
      model,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: image } },
        ],
      }],
      max_tokens: max_tokens || undefined,
    });
    const forwardReq = new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: forwardBody,
    });
    const chResp = await routeToChannel(channel.channelId, "/v1/chat/completions", forwardReq);
    if (chResp) {
      if (!chResp.ok) {
        const upstreamText = await chResp.text();
        let upstreamJson: Record<string, unknown> | null = null;
        try { upstreamJson = JSON.parse(upstreamText); } catch { /* ignore */ }
        const errMsg =
          (typeof upstreamJson?.error === "string" ? upstreamJson.error : null) ||
          ((upstreamJson?.error as Record<string, unknown>)?.message as string) ||
          upstreamText ||
          `Upstream error (${chResp.status})`;
        after(() => {
          void logUsage({
            userId, apiKeyId: apiKeyId!, model,
            task: "Image Understanding", channel: "web", channelId: channel.channelId,
            inputTokens, outputTokens: 0,
            status: "error", errorReason: errMsg,
            latencyMs: Date.now() - start,
          });
        });
        return Response.json({ error: errMsg }, { status: chResp.status });
      }

      const data = await chResp.json();
      const content = data.choices?.[0]?.message?.content || "";
      const outputTokensVal = estimateTokens(content);
      const usage = data.usage || {};
      const realInput = usage.prompt_tokens ?? inputTokens;
      const realOutput = usage.completion_tokens ?? outputTokensVal;

      after(() => {
        void logUsage({
          userId, apiKeyId: apiKeyId!, model,
          task: "Image Understanding", channel: "web", channelId: channel.channelId,
          inputTokens: realInput, outputTokens: realOutput,
          status: "ok",
          latencyMs: Date.now() - start,
        });
      });
      return Response.json({ text: content });
    }
  }

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
