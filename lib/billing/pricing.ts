import { usdToCredits } from "./credits";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";

/**
 * 定价倍率策略（Phase B）：
 * - hosted 模型（消耗平台神经元配额）：官方价 × 10,000
 * - proxied 模型（第三方计费，不消耗神经元）：官方价 × 1
 *
 * 原因：Cloudflare 免费套餐每天仅 10,000 neurons，hosted 模型需大幅加价
 * 以限制消耗；proxied 模型成本由第三方承担，按实际价格计费。
 */
const PRICE_MULTIPLIER_HOSTED = 10_000;
const PRICE_MULTIPLIER_PROXIED = 1;

/**
 * Calculate credits cost for a given model and token usage.
 * If model not found or pricing unavailable, falls back to default hosted pricing.
 */
export async function calculateCredits(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<number> {
  const catalog = await fetchModelCatalog();
  const model = catalog.find((m) => m.id === modelId);

  // Fallback: if model not found in catalog, assume hosted + text model default pricing
  if (!model) {
    const defaultUsd = ((inputTokens + outputTokens) / 1_000_000) * 0.01; // $0.01 / 1M tokens
    return usdToCredits(defaultUsd * PRICE_MULTIPLIER_HOSTED);
  }

  // If model exists but has no pricing, use default based on source
  if (!model.pricing?.[0]) {
    const defaultUsd = ((inputTokens + outputTokens) / 1_000_000) * 0.01;
    const multiplier =
      model.source === "hosted" ? PRICE_MULTIPLIER_HOSTED : PRICE_MULTIPLIER_PROXIED;
    return usdToCredits(defaultUsd * multiplier);
  }

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

  // Apply multiplier based on source
  const multiplier =
    model.source === "hosted" ? PRICE_MULTIPLIER_HOSTED : PRICE_MULTIPLIER_PROXIED;

  return usdToCredits(usd * multiplier);
}
