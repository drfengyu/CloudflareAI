import { PageHeader } from "@/components/dashboard/page-header";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { EmbeddingsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function EmbeddingsPage() {
  const catalog = await fetchModelCatalog();
  const models = catalog
    .filter((m) => m.category === "embeddings" && m.source === "hosted")
    .map((m) => ({ id: m.id, name: m.name }));

  return (
    <>
      <PageHeader title="嵌入向量" description="将文本转换为向量表示，用于相似度计算或检索" />
      {models.length === 0 ? (
        <div className="m-8 rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          无可用的嵌入模型
        </div>
      ) : (
        <EmbeddingsClient models={models} />
      )}
    </>
  );
}
