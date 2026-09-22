import type { NormalizedModel } from "@/lib/cloudflare/catalog";
import { DEFAULT_PRICE_PER_MILLION } from "./model-pricing";

/**
 * 全站唯一的货币单位是 credits；界面上的模型单价统一按「每 1K 输入 token」展示。
 * `model_pricing` 存的是 cr/1M tokens，扣费仍走该值，这里只做展示换算。
 */
export const TOKEN_PRICE_UNIT = "per K input token";

const CR_PER_M_TO_PER_K = 1000;

function trimZeros(value: number, digits: number): string {
  const fixed = value.toFixed(digits);
  return fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
}

/**
 * 展示「真正扣费的单价」。
 *
 * 入参 `crStored` 是 `model_pricing` 的口径（cr/1M tokens，已含模型倍率），
 * 与 `calculateCredits` 对齐：文本/嵌入类还要再乘基础倍率，图像固定价不乘。
 * 展示时再除以 1000 换成 per K。
 */
export function modelPriceParts(
  crStored: number,
  isImage: boolean,
  baseMultiplier = 1,
): { value: string; unit: string } {
  return isImage
    ? { value: trimZeros(crStored, 2), unit: "cr / image" }
    : {
        value: trimZeros((crStored * baseMultiplier) / CR_PER_M_TO_PER_K, 4),
        unit: `cr / ${TOKEN_PRICE_UNIT}`,
      };
}

export function formatModelPrice(
  crStored: number,
  isImage: boolean,
  baseMultiplier = 1,
): string {
  const { value, unit } = modelPriceParts(crStored, isImage, baseMultiplier);
  return `${value} ${unit}`;
}

/**
 * 计算模型在 UI 中的显示价格（从 model_pricing 表预查询的 map 中读取）。
 * 调用方需要先调用 getAllModelPricing() 获得 pricingMap。
 * 返回的 credits 单位为 cr/1M tokens（图像模型为 cr/张），展示时交给 formatModelPrice。
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
): { credits: number; isImage: boolean } {
  const pricing = pricingMap?.get(model.id);

  // 如果有 pricing 表数据，使用之（已应用 multiplier）
  if (pricing) {
    return pricing.isImage
      ? { credits: pricing.fixedPrice, isImage: true }
      : { credits: pricing.inputPrice, isImage: false };
  }

  // 回退：表中没数据，显示默认价
  return { credits: DEFAULT_PRICE_PER_MILLION, isImage: false };
}
