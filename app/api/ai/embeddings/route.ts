import { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { runModelJSON } from "@/lib/cloudflare/ai";
import { requireUser, logUsage, verifyBalance, getDefaultApiKey } from "@/lib/usage/meter";
import { calculateCredits } from "@/lib/billing/pricing";
import { estimateTokensTotal } from "@/lib/usage/tokens";
import { lookupChannel } from "@/lib/channels/lookup";
import { routeToChannel } from "@/lib/channels/router";

const schema = z.object({
  model: z.string(),
  text: z.union([z.string(), z.array(z.string())]),
});

/**
 * POST /api/ai/embeddings
 * 文本嵌入（Phase B: 加入余额校验 + 真实扣费）
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
     task: "Embeddings",
     channel: "web",
     status: "error",
     errorReason: errorMsg,
     latencyMs: Date.now() - start,
   });
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

  // 渠道路由：非 Cloudflare 模型走第三方渠道
  const channel = await lookupChannel(model, apiKeyId);
  if (channel) {
    const input = Array.isArray(text) ? text : [text];
    const forwardBody = JSON.stringify({ input, model });
    const forwardReq = new Request(req.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: forwardBody,
    });
    const chResp = await routeToChannel(channel.channelId, "/v1/embeddings", forwardReq);
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
            task: "Embeddings", channel: "web", channelId: channel.channelId,
            inputTokens: Math.floor(estimatedTokens), outputTokens: 0,
            status: "error", errorReason: errMsg,
            latencyMs: Date.now() - start,
          });
        });
        return Response.json({ error: errMsg }, { status: chResp.status });
      }

      const data = await chResp.json();
      // 优先用上游真实 usage，否则 fallback 估算
      const usage = data.usage || {};
      const realTokens = usage.prompt_tokens ?? Math.floor(estimatedTokens);

      after(() => {
        void logUsage({
          userId, apiKeyId: apiKeyId!, model,
          task: "Embeddings", channel: "web", channelId: channel.channelId,
          inputTokens: realTokens, outputTokens: 0,
          status: "ok", latencyMs: Date.now() - start,
        });
      });
      return Response.json({ embeddings: data.data || [] });
    }
  }

  // Cloudflare 原生路径
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
