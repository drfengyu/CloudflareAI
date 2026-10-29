import { unstable_cache } from "next/cache";
import { getAllModelPricing } from "./model-pricing";

/**
 * 模型价格全表的跨请求缓存。
 *
 * 模型库 / 定价页每次打开要读 361 行 model_pricing，而这张表只在管理员改价或
 * 同步 catalog 时变化。`unstable_cache` 只接受 JSON，所以缓存摊平后的 [id, 价格]
 * 数组，取出后再建 Map。
 *
 * 失效：后台改价 / 同步价格后调用 `revalidateTag(PRICING_CACHE_TAG, { expire: 0 })`，
 * 同时清进程内缓存（`invalidatePricingCaches`）。
 */
export const PRICING_CACHE_TAG = "model-pricing";

const getCachedPricingEntries = unstable_cache(
  async () => [...(await getAllModelPricing()).entries()],
  ["all-model-pricing"],
  { tags: [PRICING_CACHE_TAG], revalidate: 300 },
);

export async function getCachedModelPricingMap(): Promise<Awaited<ReturnType<typeof getAllModelPricing>>> {
  return new Map(await getCachedPricingEntries());
}
