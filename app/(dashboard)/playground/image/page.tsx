import { PageHeader } from "@/components/dashboard/page-header";
import { ImageGenPlayground } from "@/components/playground/image-gen";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";

export const dynamic = "force-dynamic";

export default async function ImagePlaygroundPage() {
  const catalog = await fetchModelCatalog();
  const imageModels = catalog
    .filter((m) => m.category === "image" && m.source === "hosted")
    .map((m) => ({ id: m.id, name: m.name }));

  return (
    <>
      <PageHeader
        title="文生图"
        description="从文本提示词生成图像，支持步数与引导强度调节"
      />
      {imageModels.length === 0 ? (
        <div className="m-8 rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          无可用的文生图模型（hosted）
        </div>
      ) : (
        <ImageGenPlayground models={imageModels} />
      )}
    </>
  );
}
