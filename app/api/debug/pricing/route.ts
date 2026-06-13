import { NextRequest } from "next/server";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { calculateCredits } from "@/lib/billing/pricing";

/**
 * Debug endpoint: test calculateCredits logic
 */
export async function GET(req: NextRequest) {
  const modelId = req.nextUrl.searchParams.get("model") || "@cf/zai-org/glm-4.7-flash";

  try {
    const catalog = await fetchModelCatalog();
    const model = catalog.find((m) => m.id === modelId);

    const testTokens = { input: 100, output: 100 };
    const credits = await calculateCredits(modelId, testTokens.input, testTokens.output);

    return Response.json({
      modelId,
      found: !!model,
      model: model ? {
        id: model.id,
        name: model.name,
        source: model.source,
        pricing: model.pricing,
      } : null,
      testTokens,
      creditsCalculated: credits,
      catalogSize: catalog.length,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
