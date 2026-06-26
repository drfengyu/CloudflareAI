import { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { runModelBinary, runModelMultipart } from "@/lib/cloudflare/ai";
import { requireUser, logUsage, verifyBalance, getDefaultApiKey } from "@/lib/usage/meter";
import { calculateCredits } from "@/lib/billing/pricing";
import { lookupChannel } from "@/lib/channels/lookup";
import { routeToChannel } from "@/lib/channels/router";

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
     task: "Text-to-Image",
     channel: "web",
     status: "error",
     errorReason: errorMsg,
     latencyMs: Date.now() - start,
   });
   return Response.json({ error: "Invalid request" }, { status: 400 });
 }

  const { model, prompt, num_steps, guidance } = parsed.data;

  // 余额预检（图像生成固定价格）
  const estimatedCredits = await calculateCredits(model, 0, 0, undefined, "Text-to-Image");

  const balanceCheck = await verifyBalance(userId, apiKeyId, estimatedCredits);
  if (!balanceCheck.ok) {
    return Response.json({ error: balanceCheck.reason }, { status: 402 });
  }

  // 渠道路由：非 Cloudflare 模型走第三方渠道
  const channel = await lookupChannel(model, apiKeyId);
  if (channel) {
    const forwardBody = JSON.stringify({ model, prompt, n: 1 });
    const forwardReq = new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: forwardBody,
    });
    const chResp = await routeToChannel(channel.channelId, "/v1/images/generations", forwardReq);
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
            task: "Text-to-Image", channel: "web", channelId: channel.channelId,
            inputTokens: Math.floor(prompt.length * 1.5), outputTokens: 1,
            status: "error", errorReason: errMsg,
            latencyMs: Date.now() - start,
          });
        });
        return Response.json({ error: errMsg }, { status: chResp.status });
      }

      const data = await chResp.json();
      const url = data.data?.[0]?.url;
      if (!url) {
        throw new Error("Image generation returned no URL");
      }
      // 下载图片并转为 base64 data URL
      const imgRes = await fetch(url);
      const imgBlob = await imgRes.blob();
      const buffer = await imgBlob.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const mimeType = imgBlob.type || "image/png";
      const dataUrl = `data:${mimeType};base64,${base64}`;

      after(() => {
        void logUsage({
          userId, apiKeyId: apiKeyId!, model,
          task: "Text-to-Image", channel: "web", channelId: channel.channelId,
          inputTokens: Math.floor(prompt.length * 1.5), outputTokens: 1,
          status: "ok",
          latencyMs: Date.now() - start,
        });
      });
      return Response.json({ image: dataUrl });
    }
  }

  try {
    // FLUX-2 系列要求真正的 multipart/form-data（即使纯文本提示），
    // 且返回 JSON envelope（result.image 为 base64）；其余模型走 JSON + 裸字节。
    const isFlux2 = model.includes("flux-2");

    let dataUrl: string;
    let neuronsUsed: number;

    if (isFlux2) {
      const fields: Record<string, string> = { prompt };
      if (num_steps) fields.steps = String(num_steps);
      if (guidance) fields.guidance = String(guidance);

      const { image, neuronsHeader } = await runModelMultipart(
        model,
        fields,
        req.signal,
      );
      neuronsUsed = parseFloat(neuronsHeader || "0");
      console.log(`[image] model=${model}, neurons header="${neuronsHeader}", parsed=${neuronsUsed}`);
      dataUrl = `data:image/png;base64,${image}`;
    } else {
      const res = await runModelBinary(
        model,
        { prompt, num_steps, guidance },
        req.signal,
      );

      // 读取 Cloudflare 返回的 neurons 消耗
      const neuronsHeader = res.headers.get("x-cf-ai-usage-neurons");
      neuronsUsed = parseFloat(neuronsHeader || "0");
      console.log(`[image] model=${model}, neurons header="${neuronsHeader}", parsed=${neuronsUsed}`);

      const blob = await res.blob();
      const buffer = await blob.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      dataUrl = `data:image/png;base64,${base64}`;
    }

    await logUsage({
      userId,
      apiKeyId,
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
      apiKeyId,
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
