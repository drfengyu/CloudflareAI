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
 * 图像模型固定定价（Phase C 扩展）：
 * 图像生成按 neurons 计费，但 Cloudflare API 不一定返回 neurons header，
 * 且不同模型消耗差异大，因此采用固定价格策略。
 */
const IMAGE_MODEL_PRICING: Record<string, number> = {
  "@cf/bytedance/stable-diffusion-xl-lightning": 3333,
  "@cf/black-forest-labs/flux-1-schnell": 3000,
  "@cf/stabilityai/stable-diffusion-xl-base-1.0": 3500,
  // 其他图像模型统一使用 default
};
const IMAGE_MODEL_DEFAULT_PRICE = 3500; // credits per image

/**
 * Calculate credits cost for a given model and token usage.
 * If model not found or pricing unavailable, falls back to default hosted pricing.
 * If catalog fetch fails, returns safe default to allow metering to continue.
 */
export async function calculateCredits(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  neurons?: number,
  task?: string,
): Promise<number> {
  try {
    // 图像模型固定定价（优先级最高）
    // task === "Text-to-Image" 或 modelId 匹配已知图像模型
    if (task === "Text-to-Image" || modelId.includes("stable-diffusion") || modelId.includes("flux")) {
      const credits = IMAGE_MODEL_PRICING[modelId] ?? IMAGE_MODEL_DEFAULT_PRICE;
      console.log(`[calculateCredits] image model fixed price: ${credits} credits`);
      return credits;
    }

    // 如果提供了 neurons，优先按 neurons 计算（音频/视频模型）
    if (neurons && neurons > 0) {
      // Cloudflare 免费套餐：10,000 neurons/day
      // 我们的定价：按 neurons 的实际消耗 × 倍率
      // 1 neuron ≈ $0.000001 (假设)，× 10,000 = 0.01 credits/neuron
      const creditsPerNeuron = 1; // 1 neuron = 1 credit
      const credits = neurons * creditsPerNeuron;
      console.log(`[calculateCredits] neurons-based: ${credits} credits (${neurons} neurons)`);
      return credits;
    }

    const catalog = await fetchModelCatalog();
    console.log(`[calculateCredits] catalog size: ${catalog.length}, modelId: ${modelId}`);
    const model = catalog.find((m) => m.id === modelId);
    console.log(`[calculateCredits] model found: ${!!model}, pricing: ${JSON.stringify(model?.pricing || null)}`);

    // Fallback: if model not found in catalog, assume hosted + text model default pricing
    if (!model) {
      const defaultUsd = ((inputTokens + outputTokens) / 1_000_000) * 0.01; // $0.01 / 1M tokens
      const credits = usdToCredits(defaultUsd * PRICE_MULTIPLIER_HOSTED);
      console.log(`[calculateCredits] fallback (model not found): ${credits} credits`);
      return credits;
    }

    // If model exists but has no pricing, use default based on source
    if (!model.pricing?.[0]) {
      const defaultUsd = ((inputTokens + outputTokens) / 1_000_000) * 0.01;
      const multiplier =
        model.source === "hosted" ? PRICE_MULTIPLIER_HOSTED : PRICE_MULTIPLIER_PROXIED;
      const credits = usdToCredits(defaultUsd * multiplier);
      console.log(`[calculateCredits] fallback (no pricing), source=${model.source}: ${credits} credits`);
      return credits;
    }

    const p = model.pricing[0];
    let usd = 0;

  // Map pricing unit to token count (match various Cloudflare unit formats)
  const unit = p.unit.toLowerCase();
  const unitTokens = unit.includes("1m") || unit.includes("per m")
    ? 1_000_000
    : unit.includes("1k") || unit.includes("per k")
      ? 1_000
      : unit.includes("image")
        ? 1
        : 0;

  if (unitTokens === 0) {
    console.log(`[calculateCredits] unknown unit "${p.unit}", using fallback`);
    const defaultUsd = ((inputTokens + outputTokens) / 1_000_000) * 0.01;
    const multiplier =
      model.source === "hosted" ? PRICE_MULTIPLIER_HOSTED : PRICE_MULTIPLIER_PROXIED;
    const credits = usdToCredits(defaultUsd * multiplier);
    return credits;
  }

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

  const finalCredits = usdToCredits(usd * multiplier);
  console.log(`[calculateCredits] calculated: ${finalCredits} credits (usd=${usd}, multiplier=${multiplier}, source=${model.source})`);
  return finalCredits;
  } catch (error) {
    // If catalog fetch fails (network, API error, etc.), return safe default
    // to allow metering to continue rather than failing the request
    console.error("[calculateCredits] ERROR - using fallback:", error);
    const defaultUsd = ((inputTokens + outputTokens) / 1_000_000) * 0.01;
    const credits = usdToCredits(defaultUsd * PRICE_MULTIPLIER_HOSTED);
    console.log(`[calculateCredits] exception fallback: ${credits} credits`);
    return credits;
  }
}
