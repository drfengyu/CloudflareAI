"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Square, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MessageItem, type ChatViewItem } from "@/components/chat/message-item";
import { SessionList, type SessionListItem } from "@/components/chat/session-list";
import { createStreamAccumulator } from "@/lib/chat/stream-accumulator";
import { estimateTokens } from "@/lib/usage/tokens";
import {
  createSessionAction,
  deleteSessionAction,
  persistTurnAction,
  pinSessionAction,
  renameSessionAction,
  updateSessionSettingsAction,
} from "@/app/(dashboard)/chat/actions";
import type { ChatModelOption } from "@/lib/chat/models";

type ActiveSession = {
  id: string;
  title: string;
  model: string;
  systemPrompt: string;
  items: ChatViewItem[];
};

type ApiMessage = { role: "system" | "user" | "assistant"; content: string };

export function ChatShell({
  models,
  sessions,
  active,
}: {
  models: ChatModelOption[];
  sessions: SessionListItem[];
  active: ActiveSession | null;
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(active?.id ?? null);
  const [items, setItems] = useState<ChatViewItem[]>(active?.items ?? []);
  const [model, setModel] = useState(active?.model || models[0]?.id || "");
  const [systemPrompt, setSystemPrompt] = useState(active?.systemPrompt ?? "");
  const [temperature, setTemperature] = useState(0.7);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const localSeq = useRef(-1);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [items]);

  const currentModel = useMemo(() => models.find((m) => m.id === model), [models, model]);
  const usedTokens = useMemo(
    () =>
      items.reduce(
        (sum, m) => sum + estimateTokens(m.content) + (m.reasoning ? estimateTokens(m.reasoning) : 0),
        0,
      ) + estimateTokens(input),
    [items, input],
  );
  const ctxPercent = currentModel?.contextWindow
    ? Math.min(100, (usedTokens / currentModel.contextWindow) * 100)
    : 0;

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId;
    const { id } = await createSessionAction({ model, systemPrompt: systemPrompt.trim() || null });
    setSessionId(id);
    return id;
  }

  /**
   * 走 /api/ai/text（扣费、限流、渠道路由都在那里），流完再落库。
   * `persist.userContent` 为 null 表示「重新生成」，不重复写用户消息。
   */
  async function runTurn(opts: {
    targetSessionId: string;
    requestMessages: ApiMessage[];
    history: ChatViewItem[];
    persist: { userContent: string | null; truncateFromSeq?: number };
    displayUser?: string;
  }) {
    const placeholder: ChatViewItem = { seq: null, role: "assistant", content: "", reasoning: null };
    const placeholderId = localSeq.current--;
    const base: ChatViewItem[] = [
      ...opts.history,
      ...(opts.displayUser
        ? [{ seq: null, role: "user" as const, content: opts.displayUser } satisfies ChatViewItem]
        : []),
    ];
    const renderWith = (assistant: ChatViewItem) => [...base, assistant];

    setItems(renderWith({ ...placeholder, seq: placeholderId }));
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const acc = createStreamAccumulator();

    const saveTurn = async () => {
      if (!acc.content && !acc.reasoning) return null;
      try {
        return await persistTurnAction({
          sessionId: opts.targetSessionId,
          model,
          userContent: opts.persist.userContent,
          assistantContent: acc.content,
          reasoning: acc.reasoning || null,
          truncateFromSeq: opts.persist.truncateFromSeq,
        });
      } catch {
        // 服务端动作失败（网络抖动 / 登录过期）时不能让异常逃出去：
        // 那样只会留一个未捕获 rejection，用户以为存好了，刷新才发现没了。
        return undefined;
      }
    };

    const applySaved = (
      saved: { userSeq: number | null; assistantSeq: number },
      partial: boolean,
    ) => {
      setItems((prev) => {
        const copy = [...prev];
        const idx = copy.findIndex((m) => m.seq === placeholderId);
        if (idx !== -1) {
          copy[idx] = {
            ...copy[idx],
            seq: saved.assistantSeq,
            content: acc.content,
            reasoning: acc.reasoning || null,
            partial: partial || undefined,
          };
        }
        if (opts.persist.userContent && saved.userSeq !== null) {
          const uIdx = copy.findIndex((m) => m.seq === null && m.role === "user");
          if (uIdx !== -1) copy[uIdx] = { ...copy[uIdx], seq: saved.userSeq };
        }
        return copy;
      });
    };

    try {
      const res = await fetch("/api/ai/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: opts.requestMessages,
          stream: true,
          temperature,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const raw = await res.text();
        let message = raw;
        try {
          message = String(JSON.parse(raw).error || raw);
        } catch {
          /* 保留原文 */
        }
        setItems(opts.history);
        toast.error(message || "请求失败");
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        acc.push(decoder.decode(value, { stream: true }));
        setItems(
          renderWith({
            ...placeholder,
            seq: placeholderId,
            content: acc.content,
            reasoning: acc.reasoning,
          }),
        );
      }

      const saved = await saveTurn();
      if (saved === undefined) {
        toast.error("回答已生成，但没能保存到会话");
        return;
      }
      if (!saved) {
        setItems(opts.history);
        toast.error("模型没有返回内容");
        return;
      }
      applySaved(saved, controller.signal.aborted);
      router.refresh();
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      // 点「停止」时 read() 抛 AbortError，已生成的半截回答仍要落库
      const saved = await saveTurn();
      if (saved) {
        applySaved(saved, true);
        router.refresh();
      } else if (saved === undefined) {
        toast.error("回答未能保存到会话");
      } else {
        setItems(opts.history);
      }
      if (!aborted) toast.error(err instanceof Error ? err.message : "生成失败");
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function toApiMessages(list: ChatViewItem[]): ApiMessage[] {
    const out: ApiMessage[] = [];
    const sys = systemPrompt.trim();
    if (sys) out.push({ role: "system", content: sys });
    for (const m of list) {
      if (m.role === "system" || !m.content) continue;
      out.push({ role: m.role, content: m.content });
    }
    return out;
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    const target = await ensureSession();
    setInput("");
    const history = items.filter((m) => m.content);
    await runTurn({
      targetSessionId: target,
      requestMessages: [...toApiMessages(history), { role: "user", content: text }],
      history,
      persist: { userContent: text },
      displayUser: text,
    });
  }

  async function handleRegenerate(assistantSeq: number) {
    if (streaming || !sessionId) return;
    const idx = items.findIndex((m) => m.seq === assistantSeq);
    if (idx === -1) return;
    const history = items.slice(0, idx);
    await runTurn({
      targetSessionId: sessionId,
      requestMessages: toApiMessages(history),
      history,
      persist: { userContent: null, truncateFromSeq: assistantSeq },
    });
  }

  async function handleEditResend(item: ChatViewItem) {
    if (streaming || !sessionId || item.seq === null) return;
    const idx = items.findIndex((m) => m.seq === item.seq);
    if (idx === -1) return;
    const history = items.slice(0, idx);
    await runTurn({
      targetSessionId: sessionId,
      requestMessages: [...toApiMessages(history), { role: "user", content: item.content }],
      history,
      persist: { userContent: item.content, truncateFromSeq: item.seq },
      displayUser: item.content,
    });
  }

  async function persistSettings(nextModel: string, nextSystem: string) {
    if (!sessionId) return;
    await updateSessionSettingsAction({
      sessionId,
      model: nextModel,
      systemPrompt: nextSystem.trim() || null,
    });
    router.refresh();
  }

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:p-8">
      <aside className="hidden lg:block">
        <SessionList
          sessions={sessions}
          activeId={sessionId}
          busy={streaming}
          onSelect={(id) => router.push(`/chat?s=${id}`)}
          onNew={() => {
            setSessionId(null);
            setItems([]);
            router.push("/chat");
          }}
          onRename={async (id, title) => {
            await renameSessionAction({ sessionId: id, title });
            router.refresh();
          }}
          onPin={async (id, pinned) => {
            await pinSessionAction({ sessionId: id, pinned });
            router.refresh();
          }}
          onDelete={async (id) => {
            await deleteSessionAction({ sessionId: id });
            if (id === sessionId) {
              setSessionId(null);
              setItems([]);
            }
            router.refresh();
          }}
        />
      </aside>

      <section className="flex min-h-[60vh] flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              void persistSettings(e.target.value, systemPrompt);
            }}
            className="h-8 max-w-[22rem] min-w-0 rounded-md border border-border bg-background px-2 text-xs"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}（{m.channel}）
              </option>
            ))}
          </select>
          <Button size="sm" variant="ghost" onClick={() => setShowSettings((v) => !v)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            会话设置
          </Button>
          {currentModel?.contextWindow ? (
            <span className="ml-auto text-[11px] text-muted-foreground">
              上下文约 {usedTokens.toLocaleString()} / {currentModel.contextWindow.toLocaleString()}（
              {ctxPercent.toFixed(1)}%）
            </span>
          ) : null}
        </div>

        {showSettings ? (
          <div className="space-y-2 rounded-lg border border-border bg-card p-3">
            <label className="block text-xs text-muted-foreground">
              系统提示词（本会话每条请求都会带上）
              <textarea
                value={systemPrompt}
                rows={3}
                onChange={(e) => setSystemPrompt(e.target.value)}
                onBlur={() => void persistSettings(model, systemPrompt)}
                placeholder="例如：你是资深前端工程师，回答简洁并给可运行代码。"
                className="mt-1 w-full resize-y rounded-md border border-border bg-background p-2 text-xs outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="flex items-center gap-3 text-xs text-muted-foreground">
              温度
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="flex-1"
              />
              <span className="tabular-nums">{temperature.toFixed(1)}</span>
            </label>
          </div>
        ) : null}

        <div ref={scrollRef} className="max-h-[55vh] flex-1 space-y-4 overflow-y-auto pr-1">
          {items.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              发条消息开始对话；会话会自动出现在左侧，随时能回来接着聊。
            </p>
          ) : null}
          {items.map((m, i) => (
            <MessageItem
              key={m.seq ?? `local-${i}`}
              item={m}
              busy={streaming}
              isStreaming={streaming && i === items.length - 1}
              onRegenerate={(seq) => void handleRegenerate(seq)}
              onEditResend={(item) => void handleEditResend(item)}
            />
          ))}
        </div>

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
        >
          <textarea
            value={input}
            rows={2}
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            className="min-h-[3.25rem] flex-1 resize-y rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          {streaming ? (
            <Button type="button" size="lg" variant="outline" onClick={() => abortRef.current?.abort()}>
              <Square className="h-4 w-4" />
              停止
            </Button>
          ) : (
            <Button type="submit" size="lg" disabled={!input.trim()}>
              {input.trim() ? <Send className="h-4 w-4" /> : <Loader2 className="h-4 w-4 opacity-0" />}
              发送
            </Button>
          )}
        </form>
      </section>
    </div>
  );
}
