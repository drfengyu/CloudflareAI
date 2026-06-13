import { usdToCredits } from "./credits";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";

/**
 * Calculate credits cost for a given model and token usage.
 * Returns 0 if model not found or pricing unavailable.
 */
export async function calculateCredits(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<number> {
  const catalog = await fetchModelCatalog();
  const model = catalog.find((m) => m.id === modelId);
  if (!model?.pricing?.[0]) return 0;

  const p = model.pricing[0];
  let usd = 0;

  // Map pricing unit to token count
  const unitTokens =
    p.unit === "1M tokens"
      ? 1_000_000
      : p.unit === "1K tokens"
        ? 1_000
        : p.unit === "image"
          ? 1
          : 0;

  if (unitTokens === 0) return 0; // unknown unit

  // If model has separate input/output pricing (some text models)
  if (model.pricing.length > 1 && model.pricing[1]) {
    const pOut = model.pricing[1];
    usd = (inputTokens / unitTokens) * p.price + (outputTokens / unitTokens) * pOut.price;
  } else {
    // Single price for total tokens (embeddings, vision, etc.)
    usd = ((inputTokens + outputTokens) / unitTokens) * p.price;
  }

  return usdToCredits(usd);
}
