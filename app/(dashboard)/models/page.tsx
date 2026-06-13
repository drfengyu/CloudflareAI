import { PageHeader } from "@/components/dashboard/page-header";
import { ModelBrowser } from "@/components/models/model-browser";
import { Badge } from "@/components/ui/badge";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";

// Catalog is fetched server-side and cached (1h) via the Cloudflare client.
export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  let models: Awaited<ReturnType<typeof fetchModelCatalog>> = [];
  let error: string | null = null;

  try {
    models = await fetchModelCatalog();
  } catch (e) {
    error = e instanceof Error ? e.message : "无法加载模型目录";
  }

  return (
    <>
      <PageHeader
        title="模型库"
        description="Workers AI 全部模型，按功能分类、查看来源/定价/能力"
        action={
          models.length > 0 ? (
            <Badge tone="muted">{models.length} 个模型</Badge>
          ) : undefined
        }
      />

      {error ? (
        <div className="m-8 rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-6 text-sm">
          <p className="mb-1 font-medium text-foreground">无法加载模型目录</p>
          <p className="text-muted-foreground">
            请在环境变量中配置 <code>CF_ACCOUNT_ID</code> 与{" "}
            <code>CF_API_TOKEN</code>（参考 <code>.env.example</code> 与{" "}
            <code>docs/DEPLOYMENT.md</code>）。
          </p>
          <p className="mt-2 text-[11px] text-danger">{error}</p>
        </div>
      ) : (
        <ModelBrowser models={models} />
      )}
    </>
  );
}
