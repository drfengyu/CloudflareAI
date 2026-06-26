/**
 * 渠道查询 helper
 *
 * 提取文本路由（text/route.ts）中重复的模型→渠道查询逻辑：
 * 1. 查 modelPricing.channelId（模型归属渠道）
 * 2. 回退到 apiKeys.channelId（Key 绑定渠道）
 * 3. 过滤掉 cloudflare 类型/禁用渠道
 *
 * 返回 { channelId, config } | null 方便调用方直接路由。
 */
import { db } from "@/lib/db/d1-http";
import { apiKeys, modelPricing } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getChannelConfig } from "./router";

export interface ChannelLookupResult {
  channelId: string;
  config: { id: string; type: string; name: string };
}

/**
 * 查找模型应路由到哪个渠道。
 * 优先级：modelPricing.channelId > apiKeys.channelId > null（走 Cloudflare 原生）。
 */
export async function lookupChannel(
  model: string,
  apiKeyId?: string | null,
): Promise<ChannelLookupResult | null> {
  // 1. 模型对应的渠道
  const modelChRows = await db
    .select({ channelId: modelPricing.channelId })
    .from(modelPricing)
    .where(eq(modelPricing.modelId, model))
    .limit(1);
  let chId: string | null = modelChRows[0]?.channelId ?? null;

  // 2. 回退到 API Key 绑定的渠道
  if (!chId && apiKeyId) {
    const keyChRows = await db
      .select({ channelId: apiKeys.channelId })
      .from(apiKeys)
      .where(eq(apiKeys.id, apiKeyId))
      .limit(1);
    chId = keyChRows[0]?.channelId ?? null;
  }

  if (!chId) return null;

  // 3. 验证渠道可用且非 Cloudflare
  const chCfg = await getChannelConfig(chId);
  if (!chCfg || !chCfg.type || chCfg.type === "cloudflare") return null;

  return { channelId: chId, config: { id: chCfg.id, type: chCfg.type, name: chCfg.name } };
}
