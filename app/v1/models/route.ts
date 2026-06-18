import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { db } from "@/lib/db/d1-http";
import { channels, modelPricing } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAdapter } from "@/lib/channels/registry";

/**
 * GET /v1/models
 *
 * 公开的模型列表发现接口（OpenAI 格式），**无需鉴权**。
 * 支持查询参数 channel_id：如果提供，返回该渠道可用的模型列表。
 * 如果不提供，返回所有 hosted 模型（向后兼容）。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const channelId = url.searchParams.get("channel_id");

  if (channelId) {
    // 查指定渠道
    const channelRow = await db
      .select()
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1);

    if (!channelRow[0]) {
      return Response.json({ object: "list", data: [] });
    }

    const ch = channelRow[0];

    // 非 Cloudflare 渠道 → 通过 adapter.listModels 获取
    if (ch.type !== "cloudflare") {
      const adapter = getAdapter(ch.type || "");
      if (adapter?.listModels) {
        let configObj: Record<string, unknown> = {};
        try { configObj = ch.config ? JSON.parse(ch.config) : {}; } catch { /* ignore */ }
        const models = await adapter.listModels({ config: configObj });
        return Response.json(
          { object: "list", data: models.map((m) => ({ id: m.id, object: m.object || "model", created: 1609459200, owned_by: ch.type })) },
          { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
        );
      }
      return Response.json({ object: "list", data: [] });
    }

    // Cloudflare 渠道：从 model_pricing 查
    const pricingEntries = await db
      .select({ modelId: modelPricing.modelId })
      .from(modelPricing)
      .where(eq(modelPricing.channelId, channelId));

    const catalog = await fetchModelCatalog();
    const allowedModelIds = new Set(pricingEntries.map((e: { modelId: string }) => e.modelId));
    const models = catalog
      .filter((m) => allowedModelIds.has(m.id))
      .map((m) => ({
        id: m.id,
        object: "model",
        created: 1609459200,
        owned_by: "cloudflare",
      }));

    return Response.json(
      { object: "list", data: models },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600" } },
    );
  }

  // 默认返回所有 hosted 模型
  const catalog = await fetchModelCatalog();
  const models = catalog
    .filter((m) => m.source === "hosted")
    .map((m) => ({
      id: m.id,
      object: "model",
      created: 1609459200,
      owned_by: "cloudflare",
    }));

  return Response.json(
    { object: "list", data: models },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
