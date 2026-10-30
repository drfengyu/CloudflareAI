import { PageHeader } from "@/components/dashboard/page-header";
import { ChatShell } from "@/components/chat/chat-shell";
import type { SessionListItem } from "@/components/chat/session-list";
import { getSession, listMessages, listSessions } from "@/lib/chat/store";
import { listTextModelOptions } from "@/lib/chat/models";
import { requireUser } from "@/lib/usage/meter";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const userId = await requireUser();
  const params = await searchParams;

  const [sessions, models] = await Promise.all([listSessions(userId), listTextModelOptions()]);

  const requestedId = params.s;
  const active = requestedId ? await getSession(userId, requestedId) : undefined;
  const messages = active ? await listMessages(active.id) : [];

  const sessionItems: SessionListItem[] = sessions.map((s) => ({
    id: s.id,
    title: s.title,
    model: s.model,
    pinned: s.pinned === 1,
    messageCount: s.messageCount,
    lastMessageAt: s.lastMessageAt ? new Date(s.lastMessageAt).getTime() : 0,
  }));

  return (
    <>
      <PageHeader
        title="AI 对话"
        description="多轮对话会存进会话，随时回来接着聊；扣费与用量同网关一致"
      />
      {models.length === 0 ? (
        <div className="m-8 rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          无可用的文本生成模型，请先在后台渠道里配置模型。
        </div>
      ) : (
        <ChatShell
          key={active?.id ?? "new"}
          models={models}
          sessions={sessionItems}
          active={
            active
              ? {
                  id: active.id,
                  model: active.model,
                  title: active.title,
                  systemPrompt: active.systemPrompt ?? "",
                  items: messages.map((m) => ({
                    seq: m.seq,
                    role: m.role,
                    content: m.content,
                    reasoning: m.reasoning,
                  })),
                }
              : null
          }
        />
      )}
    </>
  );
}
