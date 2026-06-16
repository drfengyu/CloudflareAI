import { db } from "@/lib/db/d1-http";
import { modelPricing, options } from "@/lib/db/schema";
import { fetchModelCatalog, type NormalizedModel } from "@/lib/cloudflare/catalog";
import { eq } from "drizzle-orm";

/**
 * 新版价格策略（2026-06-16 重构）：
 *
 * 旧策略（已废弃）：catalog 官方价 × 1000 + 阈值调整 → 同分类内极差 246×~2112×。
 * 新策略：按分类（含子分箱）线性映射到目标区间。
 *
 * 1) 不同 task / category 走不同的目标价格区间
 * 2) text 模型按参数量分箱（small ≤7B / medium 8-30B / large ≥30B）
 * 3) 每个 (category, subcategory) 内部，按 catalog 官方价排名 rank ∈ [0..1]
 *    线性映射到 [targetMin, targetMax]
 * 4) catalog 无定价的模型 → 落到该分类目标区间的中位数
 * 5) 图像模型保持固定价（不动）
 * 6) 输出价：catalog 有就映射；否则 text 模型用 input × 2，其他与 input 持平
 *
 * 这套策略让相对贵贱关系保留，但绝对值压缩到合理范围。
 */

/** 旧 setting key 仍保留兼容性（不再被新 sync 使用）。 */
export const BASE_MULTIPLIER = 1000;
export const ADJUST_THRESHOLD = 100;
export const ADJUST_MULTIPLIER_LOW = 5;
export const ADJUST_MULTIPLIER_HIGH = 1;
export const DEFAULT_PRICE_PER_MILLION = 100;

/**
 * 各分类（含子分箱）的目标价格区间（$/1M tokens）。
 * 参考 OpenAI 主流定价：GPT-4o $2500/$10000，GPT-4o-mini $150/$600，o1-mini $1100/$4400。
 */
const CATEGORY_RANGES = {
  textSmall: { inMin: 100, inMax: 400, outMin: 200, outMax: 800 },
  textMedium: { inMin: 300, inMax: 1200, outMin: 600, outMax: 2500 },
  textLarge: { inMin: 800, inMax: 3500, outMin: 1500, outMax: 5000 },
  embeddings: { inMin: 50, inMax: 200, outMin: 50, outMax: 200 },
  translate: { inMin: 200, inMax: 500, outMin: 200, outMax: 500 },
  vision: { inMin: 300, inMax: 800, outMin: 600, outMax: 1500 },
  classify: { inMin: 100, inMax: 300, outMin: 100, outMax: 300 },
  speech: { inMin: 200, inMax: 800, outMin: 200, outMax: 800 },
} as const;

type RangeKey = keyof typeof CATEGORY_RANGES;

/**
 * Text 模型按参数量分箱（基于 model id 字符匹配）。
 */
function classifyTextSize(modelId: string): "small" | "medium" | "large" {
  const id = modelId.toLowerCase();
  // large: ≥30B 参数 / 已知重型模型
  if (/-32b|-70b|-120b|kimi-k2|deepseek-r1|nemotron|llama-4-scout|qwq/i.test(id)) {
    return "large";
  }
  // medium: 8-30B 参数 / 已知中型模型
  if (
    /granite|gemma-4-26b|gemma-sea-lion-v4-27b|glm-4\.7|gpt-oss-20b|mistral-small-3\.1-24b|llama-3\.1-8b|llama-3\.2-11b|qwen3-30b/i.test(
      id,
    )
  ) {
    return "medium";
  }
  // small: 默认 ≤7B
  return "small";
}

/**
 * 判断模型属于哪个 range bucket（用于查 CATEGORY_RANGES）。
 */
function getRangeKey(model: NormalizedModel): RangeKey | null {
  if (model.category === "image") return null; // 图像走固定价
  if (model.category === "embeddings") return "embeddings";
  if (model.category === "translate") return "translate";
  if (model.category === "vision") return "vision";
  if (model.category === "speech") return "speech";
  if (model.category === "classify") return "classify";
  if (model.category === "text") {
    const size = classifyTextSize(model.id);
    return size === "small" ? "textSmall" : size === "medium" ? "textMedium" : "textLarge";
  }
  // 兜底
  return "textSmall";
}

/**
 * 把 catalog 中的官方价数组按 rank 映射到目标区间。
 * @param values 按升序排好的官方价列表
 * @param targetMin / targetMax 目标区间
 * @returns 一个 Map：官方价 → 映射后的最终价
 */
function buildRankMap(
  values: number[],
  targetMin: number,
  targetMax: number,
): Map<number, number> {
  const map = new Map<number, number>();
  if (values.length === 0) return map;
  if (values.length === 1) {
    // 只有一个模型 → 用区间中点
    map.set(values[0], (targetMin + targetMax) / 2);
    return map;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const minV = sorted[0];
  const maxV = sorted[sorted.length - 1];
  for (const v of sorted) {
    let rank: number;
    if (maxV === minV) {
      rank = 0.5;
    } else {
      rank = (v - minV) / (maxV - minV);
    }
    map.set(v, targetMin + rank * (targetMax - targetMin));
  }
  return map;
}

/**
 * 第一遍 + 第二遍扫描，算出每个模型的新输入价 / 输出价。
 * 不含图像模型（图像走 fixedPrice）。
 *
 * @returns Map<modelId, { inputPrice, outputPrice }>
 */
function computeNewPricing(
  catalog: NormalizedModel[],
): Map<string, { inputPrice: number; outputPrice: number }> {
  // 第一遍：按 rangeKey 分组，收集每组的官方输入价 / 输出价数组
  const grouped: Record<
    RangeKey,
    { inputs: number[]; outputs: number[] }
  > = {
    textSmall: { inputs: [], outputs: [] },
    textMedium: { inputs: [], outputs: [] },
    textLarge: { inputs: [], outputs: [] },
    embeddings: { inputs: [], outputs: [] },
    translate: { inputs: [], outputs: [] },
    vision: { inputs: [], outputs: [] },
    classify: { inputs: [], outputs: [] },
    speech: { inputs: [], outputs: [] },
  };

  for (const model of catalog) {
    const key = getRangeKey(model);
    if (!key) continue; // 图像
    const pIn = model.pricing?.[0]?.price;
    const pOut = model.pricing?.[1]?.price;
    if (pIn != null && pIn > 0) grouped[key].inputs.push(pIn);
    if (pOut != null && pOut > 0) grouped[key].outputs.push(pOut);
  }

  // 第二遍：对每组算 rank map
  const rankMaps: Record<
    RangeKey,
    { input: Map<number, number>; output: Map<number, number> }
  > = {} as never;
  for (const key of Object.keys(grouped) as RangeKey[]) {
    const range = CATEGORY_RANGES[key];
    rankMaps[key] = {
      input: buildRankMap(grouped[key].inputs, range.inMin, range.inMax),
      output: buildRankMap(grouped[key].outputs, range.outMin, range.outMax),
    };
  }

  // 第三遍：对每个 model，用 rankMap 算最终价
  const result = new Map<string, { inputPrice: number; outputPrice: number }>();
  for (const model of catalog) {
    const key = getRangeKey(model);
    if (!key) continue;
    const range = CATEGORY_RANGES[key];
    const pIn = model.pricing?.[0]?.price;
    const pOut = model.pricing?.[1]?.price;

    // 输入价
    let inputPrice: number;
    if (pIn != null && pIn > 0) {
      inputPrice = rankMaps[key].input.get(pIn) ?? (range.inMin + range.inMax) / 2;
    } else {
      // 无定价 → 区间中位数
      inputPrice = (range.inMin + range.inMax) / 2;
    }

    // 输出价
    let outputPrice: number;
    if (pOut != null && pOut > 0) {
      outputPrice = rankMaps[key].output.get(pOut) ?? (range.outMin + range.outMax) / 2;
    } else if (key.startsWith("text") || key === "vision") {
      // text/vision 无独立输出价 → 用输入价 × 2（贴近 OpenAI 4:1-5:1 比例的保守值）
      outputPrice = Math.min(inputPrice * 2, range.outMax);
    } else {
      // embeddings/translate/classify/speech → 输出价 = 输入价
      outputPrice = inputPrice;
    }

    result.set(model.id, { inputPrice, outputPrice });
  }

  return result;
}

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

export async function getPricingConfig() {
  const now = Date.now();
  if (pricingConfigCache && now - pricingConfigCache.cachedAt < CACHE_TTL) {
    return pricingConfigCache;
  }

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
 * 旧的 calculateFinalPrice 已废弃（×1000 + 阈值调整策略被取代）。
 * 保留导出以兼容可能引用它的代码，但内部直接返回默认价。
 *
 * @deprecated 新策略由 computeNewPricing 在 syncModelPricing 内部实现。
 */
export async function calculateFinalPrice(officialPrice: number | null | undefined): Promise<number> {
  const config = await getPricingConfig();
  if (officialPrice === null || officialPrice === undefined || officialPrice === 0) {
    return config.defaultPricePerMillion;
  }
  return config.defaultPricePerMillion;
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
 *
 * 新策略（2026-06-16 重构）：
 * 1) 按 (category, sub-bin) 分组所有 catalog 模型
 * 2) 每组内按官方价排名线性映射到 CATEGORY_RANGES 定义的目标区间
 * 3) 图像模型保持固定价（不参与映射）
 * 4) 无定价模型落到对应分类区间的中位数
 * 5) 保留管理员调整过的 multiplier（不覆盖）
 *
 * 仅在管理员触发或首次启动时调用。
 */
export async function syncModelPricing(): Promise<{ inserted: number; updated: number }> {
  const catalog = await fetchModelCatalog();
  const newPricing = computeNewPricing(catalog);
  let inserted = 0;
  let updated = 0;

  for (const model of catalog) {
    const isImage = isImageModel(model.id, model.category);

    // 图像模型：固定价
    // 其他模型：从 newPricing 取映射后的值
    const computed = newPricing.get(model.id);
    const inputPrice = isImage ? null : computed?.inputPrice ?? null;
    const outputPrice = isImage ? null : computed?.outputPrice ?? null;
    const fixedPrice = isImage
      ? IMAGE_MODEL_PRICING[model.id] ?? IMAGE_MODEL_DEFAULT_PRICE
      : null;
    const p = model.pricing?.[0];
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
