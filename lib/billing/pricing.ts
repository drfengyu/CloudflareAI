import { usdToCredits } from "./credits";
import { getModelPricing, DEFAULT_PRICE_PER_MILLION } from "./model-pricing";

/**
 * Calculate credits cost for a given model and token usage.
 * 计费规则（统一从 model_pricing 表读取）：
 * - 图像模型：固定价格（fixedPrice）
 * - 文本/嵌入模型：按 token 数 × 单价（inputPrice/outputPrice）
 * - 1 credit = $1 USD (1:1)
 */
export async function calculateCredits(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  neurons?: number,
  task?: string,
): Promise<number> {
  try {
    // 从 model_pricing 表读取价格
    const pricing = await getModelPricing(modelId);

    if (!pricing) {
      // 表中没有该模型，使用默认价格
      const usd = ((inputTokens + outputTokens) / 1_000_000) * DEFAULT_PRICE_PER_MILLION;
      console.log(`[calculateCredits] no pricing record, fallback: ${usd} credits`);
      return usdToCredits(usd);
    }

    // 图像模型固定价格
    if (pricing.isImage || task === "Text-to-Image") {
      console.log(`[calculateCredits] image: ${pricing.fixedPrice} credits`);
      return pricing.fixedPrice;
    }

    // 文本/嵌入模型：按 token 计费
    // inputPrice / outputPrice 单位为 $/1M tokens
    const inputUsd = (inputTokens / 1_000_000) * pricing.inputPrice;
    const outputUsd = (outputTokens / 1_000_000) * pricing.outputPrice;
    const totalUsd = inputUsd + outputUsd;

    const credits = usdToCredits(totalUsd);
    console.log(
      `[calculateCredits] ${modelId}: ${credits} cr (in=${inputTokens}@$${pricing.inputPrice}, out=${outputTokens}@$${pricing.outputPrice})`,
    );
    return credits;
  } catch (error) {
    console.error("[calculateCredits] ERROR - using fallback:", error);
    const usd = ((inputTokens + outputTokens) / 1_000_000) * DEFAULT_PRICE_PER_MILLION;
    return usdToCredits(usd);
  }
}
