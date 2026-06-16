import type { NormalizedModel } from "@/lib/cloudflare/catalog";
import { DEFAULT_PRICE_PER_MILLION } from "./model-pricing";

/**
 * 计算模型在 UI 中的显示价格（从 model_pricing 表预查询的 map 中读取）。
 * 调用方需要先调用 getAllModelPricing() 获得 pricingMap。
 */
export function getDisplayPrice(
  model: NormalizedModel,
  pricingMap?: Map<
    string,
    {
      inputPrice: number;
      outputPrice: number;
      isImage: boolean;
      fixedPrice: number;
      unit: string;
      multiplier: number;
    }
  >,
): {
  credits: number | null;
  usd: number | null;
  unit: string;
  isImage: boolean;
} {
  const pricing = pricingMap?.get(model.id);

  // 如果有 pricing 表数据，使用之（已应用 multiplier）
  if (pricing) {
    if (pricing.isImage) {
      return {
        credits: pricing.fixedPrice,
        usd: pricing.fixedPrice,
        unit: "image",
        isImage: true,
      };
    }
    return {
      credits: pricing.inputPrice,
      usd: pricing.inputPrice,
      unit: pricing.unit,
      isImage: false,
    };
  }

  // 回退：表中没数据，显示默认价
  return {
    credits: DEFAULT_PRICE_PER_MILLION,
    usd: DEFAULT_PRICE_PER_MILLION,
    unit: "per M input tokens",
    isImage: false,
  };
}
