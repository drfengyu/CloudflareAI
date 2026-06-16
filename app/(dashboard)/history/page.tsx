import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/usage/meter";
import { queryUsage } from "@/lib/usage/queries";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; model?: string; task?: string }>;
}) {
  const userId = await requireUser();
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const { logs, total } = await queryUsage({
    userId,
    page,
    pageSize: 20,
    model: params.model,
    task: params.task,
  });

  const totalPages = Math.ceil(total / 20);

  return (
    <>
      <PageHeader
        title="使用历史"
        description="查看所有 AI 调用记录（分页，可筛选）"
      />
      <div className="space-y-4 p-8">
        <Card>
          <CardContent className="pt-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                共 {total} 条记录，当前第 {page}/{totalPages || 1} 页
              </p>
              {(params.model || params.task) && (
                <a
                  href="/history"
                  className="text-xs text-primary hover:underline"
                >
                  清除筛选
                </a>
              )}
            </div>

            {logs.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">无调用记录</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => {
                  const channelLabel =
                    log.channel === "web" ? "站内" :
                    log.channel === "openai" ? "OpenAI" :
                    log.channel === "anthropic" ? "Anthropic" :
                    log.channel;

                  return (
                    <div
                      key={log.id}
                      className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface p-3 text-xs"
                    >
                      {/* 左侧：状态 + 信息 */}
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge tone={log.status === "ok" ? "success" : "danger"}>
                          {log.status}
                        </Badge>
                        <span className="text-muted-foreground whitespace-nowrap">{log.task || "未知"}</span>
                      </div>

                      {/* 中间：模型 + 渠道 + Key */}
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <a
                          href={`/history?model=${encodeURIComponent(log.model)}`}
                          className="font-mono text-[11px] text-primary hover:underline truncate max-w-[300px]"
                          title={log.model}
                        >
                          {log.model}
                        </a>
                        <Badge tone="muted">{channelLabel}</Badge>
                        {log.apiKeyName ? (
                          <Badge tone="muted">🔑 {log.apiKeyName}</Badge>
                        ) : log.channel === "web" ? (
                          <Badge tone="muted">历史数据</Badge>
                        ) : null}
                        {log.status === "error" && log.errorReason && (
                          <span className="text-xs text-danger truncate max-w-[200px]" title={log.errorReason}>
                            ⚠️ {log.errorReason}
                          </span>
                        )}
                      </div>

                      {/* 右侧：指标 */}
                      <div className="flex items-center gap-3 text-muted-foreground whitespace-nowrap">
                        {/* Token 数量 */}
                        {log.inputTokens || log.outputTokens ? (
                          <span className="w-[100px] text-right text-[11px]" title="输入 / 输出 tokens">
                            {log.inputTokens?.toLocaleString() || 0} / {log.outputTokens?.toLocaleString() || 0}
                          </span>
                        ) : (
                          <span className="w-[100px] text-right">—</span>
                        )}
                        {log.creditsUsed ? (
                          <span className="font-medium w-[80px] text-right">{log.creditsUsed.toLocaleString()} cr</span>
                        ) : (
                          <span className="w-[80px] text-right">—</span>
                        )}
                        {log.latencyMs ? (
                          <span className="w-[50px] text-right">{(log.latencyMs / 1000).toFixed(2)}s</span>
                        ) : (
                          <span className="w-[50px] text-right">—</span>
                        )}
                        <span className="w-[120px] text-right">
                          {new Date(log.createdAt!).toLocaleString("zh-CN")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                {page > 1 && (
                  <a
                    href={`/history?page=${page - 1}${params.model ? `&model=${params.model}` : ""}${params.task ? `&task=${params.task}` : ""}`}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-2"
                  >
                    上一页
                  </a>
                )}
                <span className="px-3 text-xs text-muted-foreground">
                  {page} / {totalPages}
                </span>
                {page < totalPages && (
                  <a
                    href={`/history?page=${page + 1}${params.model ? `&model=${params.model}` : ""}${params.task ? `&task=${params.task}` : ""}`}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-2"
                  >
                    下一页
                  </a>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
