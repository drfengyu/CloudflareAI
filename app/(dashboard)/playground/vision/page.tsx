import { PageHeader } from "@/components/dashboard/page-header";
import { VisionPlayground } from "@/components/playground/vision";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";

export const dynamic = "force-dynamic";

export default async function VisionPlaygroundPage() {
  const catalog = await fetchModelCatalog();
  const visionModels = catalog
    .filter((m) => m.category === "vision" && m.source === "hosted")
    .map((m) => ({ id: m.id, name: m.name }));

  return (
    <>
      <PageHeader
        title="图像理解"
        description="上传图片并提问，AI 分析图像内容"
      />
      {visionModels.length === 0 ? (
        <div className="m-8 rounded-lg border border-dashed border-border bg-surface p-6 text-sm text-muted-foreground">
          无可用的图像理解模型（hosted）
        </div>
      ) : (
        <VisionPlayground models={visionModels} />
      )}
    </>
  );
}
