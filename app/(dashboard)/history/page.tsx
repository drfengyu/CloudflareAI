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
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={log.status === "ok" ? "success" : "danger"}>
                        {log.status}
                      </Badge>
                      <span className="text-muted-foreground">{log.task || "未知"}</span>
                      <a
                        href={`/history?model=${encodeURIComponent(log.model)}`}
                        className="font-mono text-[11px] text-primary hover:underline"
                      >
                        {log.model}
                      </a>
                      <Badge tone="muted">{log.channel}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                      {log.inputTokens || log.outputTokens ? (
                        <span>
                          {log.inputTokens}+{log.outputTokens} tokens
                        </span>
                      ) : null}
                      {log.neurons ? (
                        <span>{Math.round(log.neurons)} neurons</span>
                      ) : null}
                      {log.latencyMs ? <span>{log.latencyMs}ms</span> : null}
                      <span>
                        {new Date(log.createdAt!).toLocaleString("zh-CN")}
                      </span>
                    </div>
                  </div>
                ))}
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
