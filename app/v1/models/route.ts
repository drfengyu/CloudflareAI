import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { db } from "@/lib/db/d1-http";
import { modelPricing } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /v1/models
 *
 * 公开的模型列表发现接口（OpenAI 格式），**无需鉴权**。
 * 仅返回模型 ID 等公开元数据，不涉及用量/账户信息。
 *
 * 支持查询参数 channel_id：如果提供，返回该渠道可用的模型列表（基于 model_pricing 关联）。
 * 如果不提供，返回所有 hosted 模型（向后兼容）。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const channelId = url.searchParams.get("channel_id");

  const catalog = await fetchModelCatalog();

  let models;

  if (channelId) {
    // 获取该渠道关联的模型 ID 列表
    const pricingEntries = await db
      .select({ modelId: modelPricing.modelId })
      .from(modelPricing)
      .where(eq(modelPricing.channelId, channelId));

    const allowedModelIds = new Set(pricingEntries.map((e: { modelId: string }) => e.modelId));
    models = catalog
      .filter((m) => allowedModelIds.has(m.id))
      .map((m) => ({
        id: m.id,
        object: "model",
        created: 1609459200,
        owned_by: "cloudflare",
      }));
  } else {
    // 默认返回所有 hosted 模型（向后兼容）
    models = catalog
      .filter((m) => m.source === "hosted")
      .map((m) => ({
        id: m.id,
        object: "model",
        created: 1609459200,
        owned_by: "cloudflare",
      }));
  }

  return Response.json(
    {
      object: "list",
      data: models,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
