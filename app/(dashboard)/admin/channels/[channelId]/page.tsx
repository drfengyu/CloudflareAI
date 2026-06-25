import { auth } from "@/auth";
import { db } from "@/lib/db/d1-http";
import { channels, apiKeys, usageLogs, users, modelPricing } from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Key,
  BarChart3,
  Cpu,
} from "lucide-react";
import { ChannelActions } from "./channel-actions";

export const dynamic = "force-dynamic";

const statusMap: Record<number, { label: string; tone: "success" | "warning" | "danger" | "muted" }> = {
  1: { label: "启用", tone: "success" },
  2: { label: "禁用", tone: "warning" },
  3: { label: "已删除", tone: "danger" },
};

const typeLabels: Record<string, string> = {
  cloudflare: "Cloudflare",
  openai: "OpenAI",
  anthropic: "Anthropic",
  azure: "Azure",
  deepseek: "DeepSeek",
  "openai-compatible": "OpenAI 兼容",
};

const keyStatusMap: Record<number, { label: string; tone: "success" | "danger" | "warning" | "muted" }> = {
  1: { label: "启用", tone: "success" },
  2: { label: "已禁用", tone: "danger" },
  3: { label: "已过期", tone: "warning" },
  4: { label: "额度耗尽", tone: "muted" },
};

export default async function ChannelDetailPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const { channelId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    notFound();
  }
  const currentUser = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!currentUser[0] || currentUser[0].role < 10) {
    redirect("/dashboard");
  }
  const channelRows = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  const channel = channelRows[0];
  if (!channel) {
    notFound();
  }
  const statusInfo = statusMap[channel.status] || { label: "未知", tone: "muted" as const };

  // Associated API Keys
  const associatedKeys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      status: apiKeys.status,
      quotaCredits: apiKeys.quotaCredits,
      remainCredits: apiKeys.remainCredits,
      userId: apiKeys.userId,
    })
    .from(apiKeys)
    .where(eq(apiKeys.channelId, channelId));

  // Usage stats
  const statsRows = await db
    .select({
      totalCalls: sql<number>`count(*)`,
      totalCredits: sql<number>`coalesce(sum(${usageLogs.creditsUsed}), 0)`,
      totalInputTokens: sql<number>`coalesce(sum(${usageLogs.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`coalesce(sum(${usageLogs.outputTokens}), 0)`,
    })
    .from(usageLogs)
    .where(eq(usageLogs.channelId, channelId));
  const stats: {
    totalCalls: number;
    totalCredits: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  } = statsRows[0] || {
    totalCalls: 0,
    totalCredits: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
  };

  // Top 10 models by call count
  const topModels = await db
    .select({
      model: usageLogs.model,
      callCount: sql<number>`count(*)`,
      creditsUsed: sql<number>`coalesce(sum(${usageLogs.creditsUsed}), 0)`,
    })
    .from(usageLogs)
    .where(eq(usageLogs.channelId, channelId))
    .groupBy(usageLogs.model)
    .orderBy(desc(sql<number>`count(*)`))
    .limit(10);

  // Channel model pricing entries
  const channelModels = await db
    .select({
      modelId: modelPricing.modelId,
      category: modelPricing.category,
      source: modelPricing.source,
      inputPrice: modelPricing.inputPrice,
      outputPrice: modelPricing.outputPrice,
      fixedPrice: modelPricing.fixedPrice,
      isImage: modelPricing.isImage,
      multiplier: modelPricing.multiplier,
    })
    .from(modelPricing)
    .where(eq(modelPricing.channelId, channelId))
    .orderBy(desc(modelPricing.updatedAt))
    .limit(50);

  // Parse config
  let configObject: Record<string, unknown> | null = null;
  try {
    configObject = channel.config ? JSON.parse(channel.config) : null;
  } catch {
    configObject = null;
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Back link & actions */}
      <div className="flex items-center justify-between">
        <Link
          href="/admin/channels"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回渠道列表
        </Link>

        <ChannelActions channelId={channelId} />
      </div>

      {/* Title */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{channel.name}</h1>
        <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
      </div>

      {/* Channel Info */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">类型</p>
              <p className="mt-1 text-sm font-medium">
                {typeLabels[channel.type || ""] || channel.type || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">关联密钥</p>
              <p className="mt-1 text-sm font-medium">{associatedKeys.length} 个</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">总调用</p>
              <p className="mt-1 text-sm font-medium">{stats.totalCalls.toLocaleString()} 次</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">总消耗</p>
              <p className="mt-1 text-sm font-medium">{stats.totalCredits.toLocaleString()} cr</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">输入 Tokens</p>
              <p className="mt-1 text-sm font-medium">{stats.totalInputTokens.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">输出 Tokens</p>
              <p className="mt-1 text-sm font-medium">{stats.totalOutputTokens.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">渠道 ID</p>
              <p className="mt-1 text-sm font-mono text-xs">{channel.id}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">创建时间</p>
              <p className="mt-1 text-sm">
                {channel.createdAt ? new Date(channel.createdAt).toLocaleDateString("zh-CN") : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Config JSON */}
      {configObject && Object.keys(configObject).length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-medium mb-3">渠道配置</h3>
            <div className="space-y-2">
              {Object.entries(configObject).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                  <span className="text-xs font-medium">{key}</span>
                  <span className="text-xs text-muted-foreground break-all max-w-[60%] text-right">
                    {typeof value === "string" && value.length > 20
                      ? value.slice(0, 20) + "..."
                      : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Channel Models */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="h-4 w-4" />
            <h3 className="text-sm font-medium">
              渠道模型 ({channelModels.length})
            </h3>
          </div>

          {channelModels.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              暂无关联模型，点击上方的「同步模型」从上游获取
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>模型 ID</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead className="text-right">倍率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channelModels.map((m) => (
                  <TableRow key={m.modelId}>
                    <TableCell className="font-mono text-xs max-w-[300px] truncate">
                      {m.modelId}
                    </TableCell>
                    <TableCell>
                      {m.isImage ? (
                        <Badge tone="accent">图像</Badge>
                      ) : (
                        <Badge tone="info">{m.category || "通用"}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge tone="muted">{m.source || "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {m.multiplier ? `${m.multiplier.toFixed(2)}x` : "1.00x"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Associated API Keys */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-4">
            <Key className="h-4 w-4" />
            <h3 className="text-sm font-medium">关联密钥 ({associatedKeys.length})</h3>
          </div>
          {associatedKeys.length === 0 ? (
            <p className="text-xs text-muted-foreground">暂无关联密钥</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>前缀</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>额度</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {associatedKeys.map((key) => {
                  const ks = keyStatusMap[key.status || 1] || {
                    label: "未知",
                    tone: "muted" as const,
                  };
                  return (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell>
                        <code className="text-xs font-mono">{key.prefix}...</code>
                      </TableCell>
                      <TableCell>
                        <Badge tone={ks.tone}>{ks.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {key.quotaCredits ? (
                          <>
                            {((key.remainCredits || 0) / 100).toFixed(2)} /{" "}
                            {(key.quotaCredits / 100).toFixed(2)}
                          </>
                        ) : (
                          <>无限</>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Top 10 Models */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4" />
            <h3 className="text-sm font-medium">热门模型 (Top 10)</h3>
          </div>

          {topModels.length === 0 ? (
            <p className="text-xs text-muted-foreground">暂无调用数据</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>模型</TableHead>
                  <TableHead className="text-right">调用次数</TableHead>
                  <TableHead className="text-right">消耗 Credits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topModels.map((m, i) => (
                  <TableRow key={m.model || i}>
                    <TableCell className="font-medium text-xs">
                      {m.model || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.callCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(m.creditsUsed).toLocaleString()} cr
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
