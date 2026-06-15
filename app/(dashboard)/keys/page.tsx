import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/usage/meter";
import { db } from "@/lib/db/d1-http";
import { apiKeys, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
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

  const userBalance = userRows[0]?.balanceCredits || 0;

  const keys = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));

  // 转换为 DataTable 需要的格式
  const data: ApiKeyRow[] = keys.map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    status: k.status,
    remainCredits: k.remainCredits,
    expiresAt: k.expiresAt ? new Date(k.expiresAt) : null,
    allowedModels: k.allowedModels,
    allowedIps: k.allowedIps,
    lastUsedAt: k.lastUsedAt ? new Date(k.lastUsedAt) : null,
    createdAt: new Date(k.createdAt!),
  }));

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
https://your-domain.vercel.app/api/openai/v1

# Chat completions
POST /api/openai/v1/chat/completions
Authorization: Bearer sk-cfai-xxxxx

# Embeddings
POST /api/openai/v1/embeddings

# Models
GET /api/openai/v1/models`}
              </pre>

              <p className="pt-2">
                <strong>Anthropic 兼容端点</strong>
              </p>
              <pre className="rounded-lg bg-surface-2 p-3 font-mono text-[11px]">
{`# Base URL
https://your-domain.vercel.app/api/anthropic/v1

# Messages
POST /api/anthropic/v1/messages
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
