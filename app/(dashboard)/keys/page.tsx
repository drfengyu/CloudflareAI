import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/usage/meter";
import { db } from "@/lib/db/d1-http";
import { apiKeys } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { KeysClient } from "./client";

export const dynamic = "force-dynamic";

export default async function KeysPage() {
  const userId = await requireUser();
  const keys = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));

  return (
    <>
      <PageHeader
        title="API Keys"
        description="生成 API key，供 Claude Code / Codex / Hermes 等工具调用 Cloudflare 模型"
      />
      <div className="space-y-4 p-8">
        <Card>
          <CardContent className="pt-5">
            <KeysClient />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <h3 className="mb-4 text-sm font-medium">已创建的 API Keys</h3>
            {keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无 API key</p>
            ) : (
              <div className="space-y-2">
                {keys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-sm font-medium">{key.name}</span>
                        {key.revoked && <Badge tone="danger">已撤销</Badge>}
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">
                        {key.prefix}••••••••
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        创建于 {new Date(key.createdAt!).toLocaleString("zh-CN")}
                        {key.lastUsedAt && (
                          <> · 最后使用 {new Date(key.lastUsedAt).toLocaleString("zh-CN")}</>
                        )}
                      </p>
                    </div>
                    {!key.revoked && (
                      <form action={async () => {
                        "use server";
                        const { revokeApiKeyAction } = await import("./actions");
                        await revokeApiKeyAction(key.id);
                      }}>
                        <button
                          type="submit"
                          className="rounded-lg border border-danger px-3 py-1.5 text-xs text-danger hover:bg-danger/10"
                        >
                          撤销
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            )}
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
