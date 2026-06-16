import { usdToCredits } from "./credits";
import { getModelPricing, DEFAULT_PRICE_PER_MILLION, getPricingConfig } from "./model-pricing";

/**
 * Calculate credits cost for a given model and token usage.
 * 计费规则（统一从 model_pricing 表读取）：
 * - 图像模型：固定价格（fixedPrice），不受基础倍率影响
 * - 文本/嵌入模型：按 token 数 × 单价（inputPrice/outputPrice）× 基础倍率
 * - 基础倍率仅对文本模型生效（由管理员在 /admin/settings 设置）
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
    // 读取基础倍率（仅对文本模型生效）
    const config = await getPricingConfig();
    const baseMultiplier = config.baseMultiplier;

    if (!pricing) {
      // 表中没有该模型，使用默认价格
      const usd = ((inputTokens + outputTokens) / 1_000_000) * DEFAULT_PRICE_PER_MILLION;
      const credits = usdToCredits(usd) * baseMultiplier;
      console.log(`[calculateCredits] no pricing record, fallback: ${credits} cr (base×${baseMultiplier})`);
      return credits;
    }

    // 图像模型固定价格（不受基础倍率影响）
    if (pricing.isImage || task === "Text-to-Image") {
      const credits = pricing.fixedPrice;
      console.log(`[calculateCredits] image: ${credits} cr (fixed, no base multiplier)`);
      return credits;
    }

    // 文本/嵌入模型：按 token 计费 × 基础倍率
    // inputPrice / outputPrice 单位为 $/1M tokens
    const inputUsd = (inputTokens / 1_000_000) * pricing.inputPrice;
    const outputUsd = (outputTokens / 1_000_000) * pricing.outputPrice;
    const totalUsd = inputUsd + outputUsd;

    const credits = usdToCredits(totalUsd) * baseMultiplier;
    console.log(
      `[calculateCredits] ${modelId}: ${credits} cr (in=${inputTokens}@$${pricing.inputPrice}, out=${outputTokens}@$${pricing.outputPrice}, base×${baseMultiplier})`,
    );
    return credits;
  } catch (error) {
    console.error("[calculateCredits] ERROR - using fallback:", error);
    const config = await getPricingConfig();
    const usd = ((inputTokens + outputTokens) / 1_000_000) * DEFAULT_PRICE_PER_MILLION;
    return usdToCredits(usd) * config.baseMultiplier;
  }
}
