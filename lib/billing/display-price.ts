import type { NormalizedModel } from "@/lib/cloudflare/catalog";
import { creditsToUsd } from "./credits";

/**
 * 图像模型固定定价（与 pricing.ts 同步）
 */
const IMAGE_MODEL_PRICING: Record<string, number> = {
  "@cf/bytedance/stable-diffusion-xl-lightning": 3333,
  "@cf/black-forest-labs/flux-1-schnell": 3000,
  "@cf/black-forest-labs/flux-2-dev": 4000,
  "@cf/stabilityai/stable-diffusion-xl-base-1.0": 3500,
};
const IMAGE_MODEL_DEFAULT_PRICE = 3500; // credits per image

/**
 * 定价倍率（与 pricing.ts 同步）
 */
const PRICE_MULTIPLIER_HOSTED = 1_000;
const PRICE_MULTIPLIER_PROXIED = 1;

/**
 * 计算模型在模型库中的显示价格（应用倍率后的实际计费价）
 * 返回 { credits, usd, unit, isImage, multiplier }
 */
export function getDisplayPrice(model: NormalizedModel): {
  credits: number | null;
  usd: number | null;
  unit: string;
  isImage: boolean;
  multiplier: number;
} {
  // 1. 图像模型固定价格
  const isImage =
    model.category === "image" ||
    model.id.includes("stable-diffusion") ||
    model.id.includes("flux");

  if (isImage) {
    const credits = IMAGE_MODEL_PRICING[model.id] ?? IMAGE_MODEL_DEFAULT_PRICE;
    return {
      credits,
      usd: creditsToUsd(credits),
      unit: "image",
      isImage: true,
      multiplier: 0, // 固定价，无倍率
    };
  }

  // 2. 文本/嵌入/视觉模型：按 token 计费 + 倍率
  if (!model.pricing?.[0]) {
    return {
      credits: null,
      usd: null,
      unit: "unknown",
      isImage: false,
      multiplier: 0,
    };
  }

  const p = model.pricing[0];
  const multiplier =
    model.source === "hosted" ? PRICE_MULTIPLIER_HOSTED : PRICE_MULTIPLIER_PROXIED;

  // 官方价 × 倍率
  const adjustedUsd = p.price * multiplier;
  const credits = adjustedUsd * 100; // 1 USD = 100 credits (from credits.ts CREDITS_PER_USD)

  return {
    credits,
    usd: adjustedUsd,
    unit: p.unit,
    isImage: false,
    multiplier,
  };
}
