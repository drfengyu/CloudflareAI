import { db } from "@/lib/db/d1-http";
import { modelPricing, options } from "@/lib/db/schema";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { eq } from "drizzle-orm";

/**
 * 价格策略（统一管理）：
 * - 基础倍率 ×1000：catalog 官方价 × 1000 = 基础价
 * - 调整规则：基础价 < $100 时 ×5，≥ $100 时 ×1
 * - 无定价模型：默认 $100 / 1M tokens
 * - 图像模型：固定价格
 *
 * 这些值可以通过 options 表动态配置，如果没有配置则使用默认值。
 */
export const BASE_MULTIPLIER = 1000;
export const ADJUST_THRESHOLD = 100; // $/1M tokens
export const ADJUST_MULTIPLIER_LOW = 5;
export const ADJUST_MULTIPLIER_HIGH = 1;
export const DEFAULT_PRICE_PER_MILLION = 100; // $/1M tokens

/**
 * 从 options 表读取定价配置（带缓存，避免每次计算都查数据库）。
 */
let pricingConfigCache: {
  baseMultiplier: number;
  adjustThreshold: number;
  adjustMultiplierLow: number;
  adjustMultiplierHigh: number;
  defaultPricePerMillion: number;
  cachedAt: number;
} | null = null;

const CACHE_TTL = 60_000; // 1 分钟缓存

async function getPricingConfig() {
  const now = Date.now();
  if (pricingConfigCache && now - pricingConfigCache.cachedAt < CACHE_TTL) {
    return pricingConfigCache;
  }

  const keys = [
    "pricing_base_multiplier",
    "pricing_adjust_threshold",
    "pricing_adjust_multiplier_low",
    "pricing_adjust_multiplier_high",
    "pricing_default_price_per_million",
  ];

  const rows = await db.select().from(options);
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const config = {
    baseMultiplier: parseFloat(map.get("pricing_base_multiplier") || String(BASE_MULTIPLIER)),
    adjustThreshold: parseFloat(map.get("pricing_adjust_threshold") || String(ADJUST_THRESHOLD)),
    adjustMultiplierLow: parseFloat(map.get("pricing_adjust_multiplier_low") || String(ADJUST_MULTIPLIER_LOW)),
    adjustMultiplierHigh: parseFloat(map.get("pricing_adjust_multiplier_high") || String(ADJUST_MULTIPLIER_HIGH)),
    defaultPricePerMillion: parseFloat(map.get("pricing_default_price_per_million") || String(DEFAULT_PRICE_PER_MILLION)),
    cachedAt: now,
  };

  pricingConfigCache = config;
  return config;
}

/**
 * 图像模型固定定价（$/张）
 * 注意：这些价格不参与 ×1000 基础倍率和调整规则，直接作为最终价格。
 */
const IMAGE_MODEL_PRICING: Record<string, number> = {
  "@cf/bytedance/stable-diffusion-xl-lightning": 3333,
  "@cf/black-forest-labs/flux-1-schnell": 3000,
  "@cf/black-forest-labs/flux-2-dev": 4000,
  "@cf/black-forest-labs/flux-2-klein-4b": 3500,
  "@cf/black-forest-labs/flux-2-klein-9b": 3500,
  "@cf/stabilityai/stable-diffusion-xl-base-1.0": 3500,
  "@cf/leonardo/lucid-origin": 3500,
  "@cf/leonardo/phoenix-1.0": 3500,
  "@cf/lykon/dreamshaper-8-lcm": 3500,
  "@cf/runwayml/stable-diffusion-v1-5-img2img": 3500,
  "@cf/runwayml/stable-diffusion-v1-5-inpainting": 3500,
};
const IMAGE_MODEL_DEFAULT_PRICE = 3500;

/**
 * 计算最终价格（应用 ×1000 基础倍率 + 调整规则）
 */
export async function calculateFinalPrice(officialPrice: number | null | undefined): Promise<number> {
  const config = await getPricingConfig();

  if (officialPrice === null || officialPrice === undefined || officialPrice === 0) {
    // 无定价 → 默认价格
    return config.defaultPricePerMillion;
  }
  // 先 ×基础倍率
  const basePrice = officialPrice * config.baseMultiplier;
  // 再按规则调整
  return basePrice < config.adjustThreshold
    ? basePrice * config.adjustMultiplierLow
    : basePrice * config.adjustMultiplierHigh;
}

/**
 * 判断是否为图像模型
 */
function isImageModel(modelId: string, category?: string): boolean {
  return (
    category === "image" ||
    modelId.includes("stable-diffusion") ||
    modelId.includes("flux") ||
    modelId in IMAGE_MODEL_PRICING
  );
}

/**
 * 从 catalog 初始化/同步 model_pricing 表。
 * 仅在管理员触发或首次启动时调用。
 */
export async function syncModelPricing(): Promise<{ inserted: number; updated: number }> {
  const catalog = await fetchModelCatalog();
  let inserted = 0;
  let updated = 0;

  for (const model of catalog) {
    const isImage = isImageModel(model.id, model.category);
    const p = model.pricing?.[0];
    const pOut = model.pricing?.[1];

    const inputPrice = isImage ? null : await calculateFinalPrice(p?.price);
    const outputPrice = isImage ? null : pOut ? await calculateFinalPrice(pOut.price) : null;
    const fixedPrice = isImage
      ? IMAGE_MODEL_PRICING[model.id] ?? IMAGE_MODEL_DEFAULT_PRICE
      : null;
    const unit = isImage ? "image" : p?.unit || "per M input tokens";

    // 检查是否已存在
    const existing = await db
      .select({ modelId: modelPricing.modelId, multiplier: modelPricing.multiplier })
      .from(modelPricing)
      .where(eq(modelPricing.modelId, model.id))
      .limit(1);

    if (existing[0]) {
      await db
        .update(modelPricing)
        .set({
          category: model.category,
          source: model.source,
          inputPrice,
          outputPrice,
          unit,
          isImage: isImage ? 1 : 0,
          fixedPrice,
          // 保留已有的 multiplier，不覆盖管理员调整
          updatedAt: new Date(),
        })
        .where(eq(modelPricing.modelId, model.id));
      updated++;
    } else {
      await db.insert(modelPricing).values({
        modelId: model.id,
        category: model.category,
        source: model.source,
        inputPrice,
        outputPrice,
        unit,
        isImage: isImage ? 1 : 0,
        fixedPrice,
        multiplier: 1.0, // 新模型默认倍率 1.0
      });
      inserted++;
    }
  }

  return { inserted, updated };
}

/**
 * 使用新的配置重新同步价格表（管理员修改全局倍率时调用）。
 * 清除缓存，重新计算所有模型价格，保留自定义倍率。
 */
export async function syncModelPricingWithSettings(): Promise<{ inserted: number; updated: number }> {
  // 清除缓存，强制重新读取配置
  pricingConfigCache = null;

  // 重新同步
  return await syncModelPricing();
}

/**
 * 从 model_pricing 表获取单个模型的价格。
 */
export async function getModelPricing(modelId: string): Promise<{
  inputPrice: number;
  outputPrice: number;
  isImage: boolean;
  fixedPrice: number;
  unit: string;
  multiplier: number;
} | null> {
  const rows = await db
    .select()
    .from(modelPricing)
    .where(eq(modelPricing.modelId, modelId))
    .limit(1);

  if (!rows[0]) return null;

  const multiplier = rows[0].multiplier ?? 1.0;
  const config = await getPricingConfig();

  return {
    inputPrice: (rows[0].inputPrice ?? config.defaultPricePerMillion) * multiplier,
    outputPrice: (rows[0].outputPrice ?? rows[0].inputPrice ?? config.defaultPricePerMillion) * multiplier,
    isImage: rows[0].isImage === 1,
    fixedPrice: (rows[0].fixedPrice ?? IMAGE_MODEL_DEFAULT_PRICE) * multiplier,
    unit: rows[0].unit ?? "per M input tokens",
    multiplier,
  };
}

/**
 * 获取所有模型价格（用于定价页/模型库批量显示）。
 */
export async function getAllModelPricing(): Promise<Map<string, {
  inputPrice: number;
  outputPrice: number;
  isImage: boolean;
  fixedPrice: number;
  unit: string;
  multiplier: number;
}>> {
  const rows = await db.select().from(modelPricing);
  const config = await getPricingConfig();
  const map = new Map();

  for (const row of rows) {
    const multiplier = row.multiplier ?? 1.0;
    map.set(row.modelId, {
      inputPrice: (row.inputPrice ?? config.defaultPricePerMillion) * multiplier,
      outputPrice: (row.outputPrice ?? row.inputPrice ?? config.defaultPricePerMillion) * multiplier,
      isImage: row.isImage === 1,
      fixedPrice: (row.fixedPrice ?? IMAGE_MODEL_DEFAULT_PRICE) * multiplier,
      unit: row.unit ?? "per M input tokens",
      multiplier,
    });
  }

  return map;
}
