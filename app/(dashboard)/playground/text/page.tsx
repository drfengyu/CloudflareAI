import { PageHeader } from "@/components/dashboard/page-header";
import { TextGenPlayground } from "@/components/playground/text-gen";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";

export const dynamic = "force-dynamic";

export default async function TextPlaygroundPage() {
  const catalog = await fetchModelCatalog();
  const textModels = catalog
    .filter((m) => m.category === "text" && m.source === "hosted")
    .map((m) => ({ id: m.id, name: m.name }));

  return (
    <>
      <PageHeader
        title="文本生成"
        description="对话式文本生成，支持流式输出、温度与 token 控制"
      />
      {textModels.length === 0 ? (
        <div className="m-8 rounded-lg border border-dashed border-border bg-surface p-6 text-sm text-muted">
          无可用的文本生成模型（hosted）
        </div>
      ) : (
        <TextGenPlayground models={textModels} />
      )}
    </>
  );
}
