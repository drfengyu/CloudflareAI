import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/usage/meter";
import { getConversationHistory } from "@/lib/usage/conversation";
import { MessageSquare, Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: { page?: string; search?: string };
}) {
  const userId = await requireUser();
  const page = parseInt(searchParams.page || "1");
  const search = searchParams.search;

  const { conversations, total } = await getConversationHistory(userId, page, 20, search).catch(
    () => ({ conversations: [], total: 0 }),
  );

  const totalPages = Math.ceil(total / 20);

  return (
    <>
      <PageHeader title="对话历史" description="查看已保存的文本生成对话记录" />
      <div className="space-y-4 p-8">
        {/* 搜索框 */}
        <form method="get" className="flex gap-2">
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="搜索 prompt..."
            className="h-9 flex-1 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-[color:var(--primary)]"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            搜索
          </button>
        </form>

        {/* 对话列表 */}
        {conversations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MessageSquare className="mb-3 h-12 w-12 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">
                {search ? "没有找到匹配的对话" : "暂无对话记录"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {conversations.map((conv) => (
              <Card key={conv.id}>
                <CardContent className="space-y-3 pt-5">
                  {/* 元信息 */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{conv.model}</span>
                      <span>•</span>
                      <span>
                        {new Date(conv.createdAt!).toLocaleString("zh-CN", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone="muted">{conv.creditsUsed} credits</Badge>
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Prompt */}
                  <div className="rounded-lg bg-secondary p-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Prompt</p>
                    <p className="whitespace-pre-wrap text-sm">{conv.prompt}</p>
                  </div>

                  {/* Response */}
                  <div className="rounded-lg bg-card p-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Response</p>
                    <p className="whitespace-pre-wrap text-sm">{conv.response}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            {page > 1 && (
              <a
                href={`?page=${page - 1}${search ? `&search=${search}` : ""}`}
                className="rounded-lg border border-border px-3 py-1 text-sm hover:bg-card"
              >
                上一页
              </a>
            )}
            <span className="text-sm text-muted-foreground">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <a
                href={`?page=${page + 1}${search ? `&search=${search}` : ""}`}
                className="rounded-lg border border-border px-3 py-1 text-sm hover:bg-card"
              >
                下一页
              </a>
            )}
          </div>
        )}
      </div>
    </>
  );
}
