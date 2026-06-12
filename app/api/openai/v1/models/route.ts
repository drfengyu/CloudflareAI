import { NextRequest } from "next/server";
import { extractBearerToken, verifyApiKey } from "@/lib/auth/api-key";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";

/**
 * GET /api/openai/v1/models
 * 列出可用模型（OpenAI 格式）
 */
export async function GET(req: NextRequest) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }

  const userId = await verifyApiKey(token);
  if (!userId) {
    return Response.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }

  const catalog = await fetchModelCatalog();
  const models = catalog
    .filter((m) => m.source === "hosted")
    .map((m) => ({
      id: m.id,
      object: "model",
      created: 1609459200, // placeholder
      owned_by: "cloudflare",
    }));

  return Response.json({
    object: "list",
    data: models,
  });
}
