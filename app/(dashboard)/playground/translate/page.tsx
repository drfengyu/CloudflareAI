import { PageHeader } from "@/components/dashboard/page-header";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { TranslateClient } from "./client";

export const dynamic = "force-dynamic";

// 优先作为默认翻译引擎的多语言 LLM（命中者排到列表最前）。
// 优先非推理类 instruct 模型——推理模型（qwq/qwen3/deepseek-r1）会为隐藏思考多计 output token，
// 翻译既慢又贵，故不作默认。
const PREFERRED = [
  /llama-3\.3/i,
  /llama-4/i,
  /gemma-sea-lion/i,
  /gemma-4/i,
  /mistral-small/i,
  /gpt-oss/i,
];

function preferredRank(id: string): number {
  const i = PREFERRED.findIndex((re) => re.test(id));
  return i === -1 ? PREFERRED.length : i;
}

export default async function TranslatePage() {
  const catalog = await fetchModelCatalog();

  // LLM 翻译（文本模型）：CJK 质量好，作为主要选项
  const llmModels = catalog
    .filter((m) => m.category === "text" && m.source === "hosted")
    .map((m) => ({ id: m.id, name: m.name }))
    .sort((a, b) => preferredRank(a.id) - preferredRank(b.id) || a.name.localeCompare(b.name));

  // 专用翻译模型（m2m100）：快速但 CJK 有限，保留为可选
  const legacyModels = catalog
    .filter((m) => m.category === "translate" && m.source === "hosted")
    .map((m) => ({ id: m.id, name: `${m.name}（快速 · CJK 有限）` }));

  const models = [...llmModels, ...legacyModels];

  return (
    <>
      <PageHeader title="翻译" description="多语言翻译服务（推荐用 LLM 模型，中日韩质量更好）" />
      {models.length === 0 ? (
        <div className="m-8 rounded-lg border border-dashed border-border bg-surface p-6 text-sm text-muted-foreground">
          无可用的翻译模型
        </div>
      ) : (
        <TranslateClient models={models} />
      )}
    </>
  );
}
