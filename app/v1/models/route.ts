import { fetchModelCatalog } from "@/lib/cloudflare/catalog";

/**
 * GET /v1/models
 *
 * 公开的模型列表发现接口（OpenAI 格式），**无需鉴权**。
 * 仅返回模型 ID 等公开元数据，不涉及用量/账户信息，故和官网 `/pricing`、`/models`
 * 一样允许匿名访问 —— 方便客户端在配置 API key 之前先发现可用模型。
 */
export async function GET() {
  const catalog = await fetchModelCatalog();
  const models = catalog
    .filter((m) => m.source === "hosted")
    .map((m) => ({
      id: m.id,
      object: "model",
      created: 1609459200, // placeholder
      owned_by: "cloudflare",
    }));

  return Response.json(
    {
      object: "list",
      data: models,
    },
    {
      headers: {
        // 模型目录变化频率很低，允许 CDN 边缘缓存 5 分钟，stale 1 小时。
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
