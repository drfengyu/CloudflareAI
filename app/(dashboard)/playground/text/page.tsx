import { PageHeader } from "@/components/dashboard/page-header";
import { TextGenPlayground } from "@/components/playground/text-gen";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { requireUser, getDefaultApiKey } from "@/lib/usage/meter";
import { db } from "@/lib/db/d1-http";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function TextPlaygroundPage() {
  const userId = await requireUser();
  const defaultKeyId = await getDefaultApiKey(userId);

  let keyName = "未设置";
  if (defaultKeyId) {
    const keyRows = await db
      .select({ name: apiKeys.name })
      .from(apiKeys)
      .where(eq(apiKeys.id, defaultKeyId))
      .limit(1);
    keyName = keyRows[0]?.name || "未知";
  }

  const catalog = await fetchModelCatalog();
  const textModels = catalog
    .filter((m) => m.category === "text" && m.source === "hosted")
    .map((m) => ({ id: m.id, name: m.name }));

  return (
    <>
      <PageHeader
        title="文本生成"
        description="对话式文本生成，支持流式输出、温度与 token 控制"
        action={
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">使用 API Key:</span>
            <Badge tone="muted">🔑 {keyName}</Badge>
          </div>
        }
      />
      {textModels.length === 0 ? (
        <div className="m-8 rounded-lg border border-dashed border-border bg-surface p-6 text-sm text-muted-foreground">
          无可用的文本生成模型（hosted）
        </div>
      ) : (
        <TextGenPlayground models={textModels} />
      )}
    </>
  );
}
