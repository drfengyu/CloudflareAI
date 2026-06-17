import { NextRequest } from "next/server";
import { z } from "zod";
import { runModelJSON, openaiCompatible } from "@/lib/cloudflare/ai";
import { requireUser, logUsage, verifyBalance, getDefaultApiKey } from "@/lib/usage/meter";
import { calculateCredits } from "@/lib/billing/pricing";
import { estimateTokens } from "@/lib/usage/tokens";

const schema = z.object({
  model: z.string(),
  text: z.string().min(1),
  source_lang: z.string().optional(), // 省略 = 自动检测
  target_lang: z.string(),
});

// 语言码 → 英文名（用于 LLM 翻译提示词；m2m100 直接用码）
const LANG_NAMES: Record<string, string> = {
  zh: "Chinese",
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  ja: "Japanese",
  ko: "Korean",
  ru: "Russian",
  ar: "Arabic",
  pt: "Portuguese",
  it: "Italian",
};
function langName(code?: string): string | undefined {
  if (!code) return undefined;
  return LANG_NAMES[code] ?? code;
}

/**
 * POST /api/ai/translate
 * 翻译。两条路径：
 * - m2m100（category=translate）：专用翻译模型，速度快，但 CJK 质量差。返回真实 usage。
 * - LLM（其余文本模型）：用翻译提示词调用对话模型，CJK 质量远优于 m2m100。返回真实 usage。
 * 计费一律使用上游返回的真实 token usage（不再用 text.length × 1.5 估算）。
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
     task: "Translation",
     channel: "web",
     status: "error",
     errorReason: errorMsg,
     latencyMs: Date.now() - start,
   });
   return Response.json({ error: "Invalid request" }, { status: 400 });
 }

  const { model, text, source_lang, target_lang } = parsed.data;
  const isM2m100 = model.includes("m2m100");

  // 余额预检（用估算；真正计费用上游真实 usage）。译文长度可能略多于原文。
  const estInput = estimateTokens(text) + 32;
  const estOutput = Math.ceil(estimateTokens(text) * 1.5) + 16;
  const estimatedCredits = await calculateCredits(model, estInput, estOutput);

  const balanceCheck = await verifyBalance(userId, apiKeyId, estimatedCredits);
  if (!balanceCheck.ok) {
    return Response.json({ error: balanceCheck.reason }, { status: 402 });
  }

  try {
    let translated = "";
    let inputTokens = 0;
    let outputTokens = 0;

    if (isM2m100) {
      // 专用翻译模型路径（m2m100 会返回真实 usage）
      const result = await runModelJSON<{
        translated_text?: string;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      }>(model, { text, source_lang, target_lang }, req.signal);

      translated = result.translated_text || "";
      inputTokens = result.usage?.prompt_tokens ?? estimateTokens(text);
      outputTokens = result.usage?.completion_tokens ?? estimateTokens(translated);
    } else {
      // LLM 翻译路径：用文本模型 + 翻译提示词（CJK 质量远优于 m2m100）
      const targetName = langName(target_lang) ?? target_lang;
      const sourceName = langName(source_lang);
      const sourceClause = sourceName
        ? `The source language is ${sourceName}.`
        : "Detect the source language automatically.";
      const system =
        `You are a professional translation engine. Translate the user's text into ${targetName}. ` +
        `${sourceClause} Output ONLY the translated text, with no quotes, explanations, or extra content.`;

      const res = await openaiCompatible(
        "chat/completions",
        {
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: text },
          ],
          stream: false,
          temperature: 0.3,
        },
        req.signal,
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Model run failed");
      }

      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || "";
      // 防御：个别推理模型可能把 <think> 思考块混进 content，剥离后再返回。
      translated = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      const usage = data.usage || {};
      inputTokens = usage.prompt_tokens ?? estInput;
      outputTokens = usage.completion_tokens ?? estimateTokens(translated);
    }

    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Translation",
      channel: "web",
      inputTokens,
      outputTokens,
      status: "ok",
      latencyMs: Date.now() - start,
    });

    return Response.json({ text: translated });
  } catch (err) {
    await logUsage({
      userId,
      apiKeyId,
      model,
      task: "Translation",
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
