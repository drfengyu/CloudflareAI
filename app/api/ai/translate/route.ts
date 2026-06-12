import { NextRequest } from "next/server";
import { z } from "zod";
import { runModelJSON } from "@/lib/cloudflare/ai";
import { requireUser, logUsage } from "@/lib/usage/meter";

const schema = z.object({
  model: z.string(),
  text: z.string().min(1),
  source_lang: z.string().optional(),
  target_lang: z.string(),
});

/**
 * POST /api/ai/translate
 * 翻译：输入文本 + 目标语言 → 翻译结果
 */
export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const body = await req.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { model, text, source_lang, target_lang } = parsed.data;
  const start = Date.now();

  try {
    const result = await runModelJSON<{ translated_text: string }>(
      model,
      { text, source_lang, target_lang },
      req.signal,
    );

    await logUsage({
      userId,
      model,
      task: "Translation",
      channel: "web",
      status: "ok",
      latencyMs: Date.now() - start,
    });

    return Response.json({ text: result.translated_text || "" });
  } catch (err) {
    await logUsage({
      userId,
      model,
      task: "Translation",
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
