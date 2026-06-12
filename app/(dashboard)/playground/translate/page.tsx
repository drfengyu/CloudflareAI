import { PageHeader } from "@/components/dashboard/page-header";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { TranslateClient } from "./client";

export const dynamic = "force-dynamic";

export default async function TranslatePage() {
  const catalog = await fetchModelCatalog();
  const models = catalog
    .filter((m) => m.category === "translate" && m.source === "hosted")
    .map((m) => ({ id: m.id, name: m.name }));

  return (
    <>
      <PageHeader title="翻译" description="多语言翻译服务" />
      {models.length === 0 ? (
        <div className="m-8 rounded-lg border border-dashed border-border bg-surface p-6 text-sm text-muted">
          无可用的翻译模型
        </div>
      ) : (
        <TranslateClient models={models} />
      )}
    </>
  );
}
