"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Brain, Check, ChevronDown, ChevronRight, Copy, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChatRole = "system" | "user" | "assistant";

export type ChatViewItem = {
  /** 落库后的 seq；本轮新生成的消息在 persist 前为 null。 */
  seq: number | null;
  role: ChatRole;
  content: string;
  reasoning?: string | null;
  /** 生成中断/失败标记。 */
  partial?: boolean;
};

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const code = String(children ?? "").replace(/\n$/, "");
  const lang = /language-(\w+)/.exec(className ?? "")?.[1] ?? "";
  const [copied, setCopied] = useState(false);

  return (
    <div className="relative my-3 overflow-hidden rounded-lg border border-border bg-muted/40">
      <div className="flex items-center justify-between border-b border-border bg-muted/60 px-3 py-1">
        <span className="font-mono text-[11px] text-muted-foreground">{lang || "text"}</span>
        <button
          type="button"
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => {
            navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function MessageItem({
  item,
  isStreaming,
  busy,
  onRegenerate,
  onEditResend,
}: {
  item: ChatViewItem;
  isStreaming: boolean;
  /** 本页有请求在流式返回中；此时重新生成/编辑重发都会被 runTurn 挡掉，索性不给按钮。 */
  busy: boolean;
  onRegenerate?: (userSeq: number) => void;
  onEditResend?: (item: ChatViewItem) => void;
}) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.content);
  const isUser = item.role === "user";

  if (!item.content && !item.reasoning && !isStreaming) return null;

  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      {item.reasoning ? (
        <button
          type="button"
          onClick={() => setReasoningOpen((v) => !v)}
          className="flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
        >
          <Brain className="h-3 w-3" />
          思考过程
          {reasoningOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      ) : null}
      {item.reasoning && reasoningOpen ? (
        <div className="max-w-[46rem] whitespace-pre-wrap rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          {item.reasoning}
        </div>
      ) : null}

      <div
        className={cn(
          "max-w-[46rem] rounded-2xl px-4 py-3 text-sm",
          isUser ? "ml-12 bg-primary/10" : "mr-12 bg-secondary",
        )}
      >
        {isUser ? (
          editing ? (
            <div className="w-full min-w-[22rem]">
              <textarea
                value={draft}
                rows={4}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full resize-y rounded-md border border-border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  取消
                </Button>
                <Button
                  size="sm"
                  disabled={!draft.trim() || item.seq === null}
                  onClick={() => {
                    setEditing(false);
                    onEditResend?.({ ...item, content: draft.trim() });
                  }}
                >
                  保存并重发
                </Button>
              </div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap">{item.content}</div>
          )
        ) : (
          <div className="chat-markdown break-words">
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                pre: ({ children }) => <>{children}</>,
                code: ({ className, children }) =>
                  String(children ?? "").includes("\n") || className?.startsWith("language-") ? (
                    <CodeBlock className={className}>{children}</CodeBlock>
                  ) : (
                    <code className={cn("rounded bg-muted px-1 py-0.5 text-[13px]", className)}>
                      {children}
                    </code>
                  ),
              }}
            >
              {item.content}
            </Markdown>
            {isStreaming ? <span className="ml-0.5 inline-block animate-pulse">▍</span> : null}
          </div>
        )}
        {item.partial ? (
          <p className="mt-2 text-[11px] text-warning">内容在生成中被中断，已保留到此处。</p>
        ) : null}
      </div>

      {!isUser && !busy && item.seq !== null ? (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => onRegenerate?.(item.seq!)}>
            <RefreshCw className="h-3.5 w-3.5" />
            重新生成
          </Button>
        </div>
      ) : null}
      {isUser && !busy && item.seq !== null ? (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
            编辑重发
          </Button>
        </div>
      ) : null}
    </div>
  );
}
