import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/usage/meter";
import { db } from "@/lib/db/d1-http";
import { apiKeys, usageLogs, channels, modelPricing } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { getActualBalance } from "@/lib/billing/display-balance";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { Plus } from "lucide-react";
import { type ApiKeyRow } from "./columns";
import { KeysClient } from "./client";
import { KeysTable } from "./keys-table";

export const dynamic = "force-dynamic";

export default async function KeysPage() {
  const userId = await requireUser();
  const userBalance = await getActualBalance(userId);

  // Fetch API keys (without leftJoin to avoid Drizzle field mapping bug)
  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      status: apiKeys.status,
      quotaCredits: apiKeys.quotaCredits,
      remainCredits: apiKeys.remainCredits,
      expiresAt: apiKeys.expiresAt,
      allowedModels: apiKeys.allowedModels,
      allowedIps: apiKeys.allowedIps,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
      channelId: apiKeys.channelId,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));

  // Fetch all channels separately
  const allChannels = await db
    .select({ id: channels.id, name: channels.name, type: channels.type })
    .from(channels);

  const channelMap = new Map(allChannels.map(c => [c.id, c]));

  const keyUsageMap = new Map<string, { used: number; calls: number }>();
  for (const key of keys) {
    const usageRows = await db
      .select({
        total: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(usageLogs)
      .where(eq(usageLogs.apiKeyId, key.id));
    keyUsageMap.set(key.id, {
      used: usageRows[0]?.total || 0,
      calls: usageRows[0]?.count || 0,
    });
  }

  const data: ApiKeyRow[] = keys.map((k) => {
    const usage = keyUsageMap.get(k.id) || { used: 0, calls: 0 };
    const channel = k.channelId ? channelMap.get(k.channelId) : null;
    return {
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      status: k.status,
      quotaCredits: k.quotaCredits,
      remainCredits: k.remainCredits,
      expiresAt: k.expiresAt ? new Date(k.expiresAt) : null,
      allowedModels: k.allowedModels,
      allowedIps: k.allowedIps,
      lastUsedAt: k.lastUsedAt ? new Date(k.lastUsedAt) : null,
      createdAt: new Date(k.createdAt!),
      actualUsed: usage.used,
      callCount: usage.calls,
      userBalance,
      channelId: k.channelId,
      channelName: channel?.name || null,
      channelType: channel?.type || null,
    };
  });

  // 获取可用渠道列表
  const channelList: { id: string; name: string; type: string }[] = (
    await db
      .select({ id: channels.id, name: channels.name, type: channels.type })
      .from(channels)
      .where(eq(channels.status, 1))
  ).filter((c): c is { id: string; name: string; type: string } => c.type !== null);

  // 获取所有模型列表（供 KeySheet 模型白名单使用）
  // 每个模型携带 channelId：Cloudflare hosted 模型 channelId = null（属于默认 Cloudflare 渠道，
  // 因为默认渠道 default-cloudflare 在数据库里独立存在，但 hosted 模型并不在 model_pricing 表里
  // 写它的 channelId — 这里统一用 'default-cloudflare' 占位，便于按渠道过滤）。
  const catalog = await fetchModelCatalog();
  const defaultCfChannel = channelList.find((c) => c.type === "cloudflare");
  const cfModels = catalog
    .filter((m) => m.source === "hosted")
    .map((m) => ({
      id: m.id,
      name: m.name,
      channelId: defaultCfChannel?.id || null,
    }));

  // 从 model_pricing 拿其他渠道的模型（含 channelId）
  const pricingModels = await db
    .select({ modelId: modelPricing.modelId, channelId: modelPricing.channelId })
    .from(modelPricing);

  const cfModelIds = new Set(cfModels.map((c) => c.id));
  const extraModels = pricingModels
    .filter((p) => !cfModelIds.has(p.modelId))
    .map((p) => ({
      id: p.modelId,
      name: p.modelId.split("/").pop() || p.modelId,
      channelId: p.channelId,
    }));

  const allModelOptions = [...cfModels, ...extraModels].filter(
    (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i,
  );

  return (
    <>
      <PageHeader
        title="API Keys"
        description="生成 API key，供 Claude Code / Codex / Hermes 等工具调用 AI 模型"
        action={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            创建密钥
          </Button>
        }
      />
      <div className="space-y-4 p-8">
        <Card>
          <CardContent className="pt-5">
            <KeysClient />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <KeysTable data={data} channels={channelList} models={allModelOptions} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-5">
            <h3 className="text-sm font-medium">使用说明</h3>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p><strong>OpenAI 兼容端点</strong></p>
              <pre className="rounded-lg bg-secondary p-3 font-mono text-[11px]">
{`POST /v1/chat/completions
Authorization: Bearer sk-cfai-xxxxx

POST /v1/embeddings
GET /v1/models`}
              </pre>
              <p className="pt-2"><strong>Anthropic 兼容端点</strong></p>
              <pre className="rounded-lg bg-secondary p-3 font-mono text-[11px]">
{`POST /v1/messages
x-api-key: sk-cfai-xxxxx
anthropic-version: 2023-06-01`}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
