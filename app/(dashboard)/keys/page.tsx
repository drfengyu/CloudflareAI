import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/usage/meter";
import { db } from "@/lib/db/d1-http";
import { apiKeys, users, usageLogs, temporaryBalances } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { type ApiKeyRow } from "./columns";
import { KeysClient } from "./client";
import { KeysTable } from "./keys-table";

export const dynamic = "force-dynamic";

export default async function KeysPage() {
  const userId = await requireUser();

  // 获取用户余额
  const userRows = await db
    .select({ balanceCredits: users.balanceCredits })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const permanentBalance = userRows[0]?.balanceCredits || 0;

  // 实际余额 = 永久余额 + 未过期临时余额（与钱包页口径一致）
  const now = new Date();
  const tempRows = await db
    .select()
    .from(temporaryBalances)
    .where(eq(temporaryBalances.userId, userId));
  const temporaryTotal = tempRows
    .filter((tb) => new Date(tb.expiresAt) > now)
    .reduce((acc, tb) => acc + tb.amount, 0);

  const userBalance = permanentBalance + temporaryTotal;

  const keys = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));

  // 查询每个 key 的实际使用量和调用次数
  const keyUsageMap = new Map<string, { used: number; calls: number }>();
  for (const key of keys) {
    const usageRows = await db
      .select({
        total: sql<number>`COALESCE(SUM(${usageLogs.creditsUsed}), 0)`,
        count: sql<number>`COUNT(*)`
      })
      .from(usageLogs)
      .where(eq(usageLogs.apiKeyId, key.id));
    keyUsageMap.set(key.id, {
      used: usageRows[0]?.total || 0,
      calls: usageRows[0]?.count || 0
    });
  }

  // 转换为 DataTable 需要的格式
  const data: ApiKeyRow[] = keys.map((k) => {
    const usage = keyUsageMap.get(k.id) || { used: 0, calls: 0 };
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
    };
  });

  return (
    <>
      <PageHeader
        title="API Keys"
        description="生成 API key，供 Claude Code / Codex / Hermes 等工具调用 Cloudflare 模型"
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
            <KeysTable data={data} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-5">
            <h3 className="text-sm font-medium">使用说明</h3>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>
                <strong>OpenAI 兼容端点</strong>（适用于 Claude Code / Codex / Hermes）
              </p>
              <pre className="rounded-lg bg-surface-2 p-3 font-mono text-[11px]">
{`# Base URL
https://your-domain.vercel.app/v1

# Chat completions
POST /v1/chat/completions
Authorization: Bearer sk-cfai-xxxxx

# Embeddings
POST /v1/embeddings

# Models
GET /v1/models`}
              </pre>

              <p className="pt-2">
                <strong>Anthropic 兼容端点</strong>
              </p>
              <pre className="rounded-lg bg-surface-2 p-3 font-mono text-[11px]">
{`# Base URL
https://your-domain.vercel.app/v1

# Messages
POST /v1/messages
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
