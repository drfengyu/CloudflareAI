"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Send, Loader2, Brain, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  /** Reasoning chain (thinking) — separated from content so we can fold it. */
  reasoning?: string;
}

interface ModelOption {
  id: string;
  name: string;
  channel?: string;
  /** Model context window (token budget). Undefined for proxied models without metadata. */
  contextWindow?: number;
}

interface TextGenProps {
  models: ModelOption[];
}

/** Naive token estimator: CJK ≈ 1 token/char, latin ≈ 1 token / 4 chars. */
function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    // CJK Unified Ideographs / Hangul / Hiragana / Katakana ranges
    if (
      (code >= 0x3400 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0x3040 && code <= 0x30ff)
    ) {
      cjk++;
    } else {
      other++;
    }
  }
  return Math.ceil(cjk + other / 4);
}

export function TextGenPlayground({ models }: TextGenProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(models[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  // Folded reasoning UI: assistant message index → collapsed flag
  const [foldedReasoning, setFoldedReasoning] = useState<Record<number, boolean>>({});
  // Copy feedback: assistant message index → copied flag
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 持久化：从 localStorage 恢复状态
  useEffect(() => {
    try {
      const saved = localStorage.getItem("text-playground-state");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.messages) setMessages(parsed.messages);
        if (parsed.selectedModel && models.some((m) => m.id === parsed.selectedModel)) {
          setSelectedModel(parsed.selectedModel);
        }
        if (typeof parsed.temperature === "number") setTemperature(parsed.temperature);
        if (parsed.foldedReasoning) setFoldedReasoning(parsed.foldedReasoning);
      }
    } catch {
      // ignore parse errors
    }
  }, [models]);

  // 持久化：保存状态到 localStorage（防抖）
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          "text-playground-state",
          JSON.stringify({
            messages,
            selectedModel,
            temperature,
            foldedReasoning,
          }),
        );
      } catch {
        // ignore storage errors
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [messages, selectedModel, temperature, foldedReasoning]);

  const currentModel = useMemo(
    () => models.find((m) => m.id === selectedModel),
    [models, selectedModel],
  );

  // Conversation token usage estimate: sum all message bodies (incl. reasoning).
  const usedTokens = useMemo(() => {
    let sum = 0;
    for (const m of messages) {
      sum += estimateTokens(m.content);
      if (m.reasoning) sum += estimateTokens(m.reasoning);
    }
    sum += estimateTokens(input);
    return sum;
  }, [messages, input]);

  const ctxPercent = currentModel?.contextWindow
    ? Math.min(100, (usedTokens / currentModel.contextWindow) * 100)
    : 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function copyToClipboard(text: string, index: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: [...messages, userMsg],
          stream: true,
          temperature,
          // max_tokens 不再由前端传入，交由模型默认值
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        let errMsg: string;
        try {
          const json = JSON.parse(text);
          errMsg = json.error || text;
        } catch {
          errMsg = text || "Request failed";
        }
        throw new Error(errMsg);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let assistantReasoning = "";
      let assistantIndex = -1;
      let insideThinkTag = false; // 追踪是否在 <think> 标签内

      setMessages((m) => {
        const copy = [...m, { role: "assistant" as const, content: "", reasoning: "" }];
        assistantIndex = copy.length - 1;
        return copy;
      });
      // Auto-fold reasoning by default for this new assistant message
      setFoldedReasoning((f) => ({ ...f, [assistantIndex]: false }));

      // Buffer SSE across chunks: events end with \n\n. Splitting on each
      // received chunk's newlines drops events that span chunk boundaries.
      let sseBuf = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuf += decoder.decode(value, { stream: true });
        const events = sseBuf.split(/\n\n|\r\n\r\n/);
        sseBuf = events.pop() ?? "";

        for (const ev of events) {
          for (const line of ev.split(/\r?\n/)) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              if (!delta) continue;

              // DeepSeek 等模型使用独立的 reasoning_content 字段
              const reasoningDelta = delta.reasoning_content;
              // Qwen/QwQ 等模型把思考内容混在 content 里，用 <think> 标签包裹
              const contentDelta = delta.content;

              if (typeof reasoningDelta === "string" && reasoningDelta) {
                assistantReasoning += reasoningDelta;
              }

              if (typeof contentDelta === "string" && contentDelta) {
                // 检测 <think> 标签开始/结束
                let remainingDelta = contentDelta;

                while (remainingDelta) {
                  if (!insideThinkTag) {
                    const thinkStart = remainingDelta.indexOf("<think>");
                    if (thinkStart !== -1) {
                      // 在 <think> 前的正文
                      if (thinkStart > 0) {
                        assistantContent += remainingDelta.slice(0, thinkStart);
                      }
                      insideThinkTag = true;
                      remainingDelta = remainingDelta.slice(thinkStart + 7); // "<think>".length = 7
                    } else {
                      // 没有 <think> 标签，全部是正文
                      assistantContent += remainingDelta;
                      break;
                    }
                  } else {
                    // 在 <think> 标签内
                    const thinkEnd = remainingDelta.indexOf("</think>");
                    if (thinkEnd !== -1) {
                      // 思考内容结束
                      assistantReasoning += remainingDelta.slice(0, thinkEnd);
                      insideThinkTag = false;
                      remainingDelta = remainingDelta.slice(thinkEnd + 8); // "</think>".length = 8
                    } else {
                      // <think> 标签未闭合，整段是思考内容
                      assistantReasoning += remainingDelta;
                      break;
                    }
                  }
                }
              }

              if (reasoningDelta || contentDelta) {
                const idx = assistantIndex;
                let snapshotContent = assistantContent;
                let snapshotReasoning = assistantReasoning;

                // Qwen QwQ-32B 启发式分离：如果没有 <think> 标签，
                // 但内容以推理关键词开头，尝试分离思考与正文
                if (!snapshotReasoning && snapshotContent) {
                  // 检测 QwQ 推理模式：以"嗯，"、"首先，"等开头的长段推理
                  const reasoningPattern = /^(嗯，|首先，|让我|我需要|好的，让我|Alright, let me|First, I need to|Let me think)/;
                  if (reasoningPattern.test(snapshotContent)) {
                    // 查找推理结束标记：换行 + 非推理性语句（如"你好"、"我是"等）
                    const answerPattern = /\n\n(你好|我是|很高兴|Hello|I am|I'm|Nice to meet)/;
                    const answerMatch = snapshotContent.match(answerPattern);

                    if (answerMatch && answerMatch.index !== undefined) {
                      // 分离思考和正文
                      snapshotReasoning = snapshotContent.slice(0, answerMatch.index).trim();
                      snapshotContent = snapshotContent.slice(answerMatch.index).trim();
                    }
                  }
                }

                setMessages((m) => {
                  const copy = [...m];
                  copy[idx] = {
                    role: "assistant",
                    content: snapshotContent,
                    reasoning: snapshotReasoning || undefined,
                  };
                  return copy;
                });
              }
            } catch {
              // ignore non-JSON SSE lines
            }
          }
        }
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `❌ 错误: ${err instanceof Error ? err.message : "未知错误"}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-8">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">模型</span>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="h-8 min-w-[280px] rounded-lg border border-border bg-card px-2 text-sm outline-none"
          >
            <optgroup label="Cloudflare 托管">
              {models.filter((m) => m.channel === "cloudflare" || !m.channel).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
            {(() => {
              const channelModels = models.filter((m) => m.channel && m.channel !== "cloudflare");
              // 按渠道名称分组
              const groups = new Map<string, typeof channelModels>();
              for (const m of channelModels) {
                const ch = m.channel || "其他";
                if (!groups.has(ch)) groups.set(ch, []);
                groups.get(ch)!.push(m);
              }
              return Array.from(groups.entries()).map(([channel, ms]) => (
                <optgroup key={channel} label={channel}>
                  {ms.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              ));
            })()}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">温度</span>
          <input
            type="number"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            min="0"
            max="2"
            step="0.1"
            className="h-8 w-20 rounded-lg border border-border bg-card px-2 text-sm outline-none"
          />
        </label>

        {/* Context window usage — readonly, dynamic per selected model. */}
        <div className="flex min-w-[220px] flex-1 items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">上下文</span>
          {currentModel?.contextWindow ? (
            <>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${ctxPercent}%` }}
                />
              </div>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                {usedTokens.toLocaleString()} / {currentModel.contextWindow.toLocaleString()}
                <span className="ml-1 opacity-60">({ctxPercent.toFixed(1)}%)</span>
              </span>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {usedTokens.toLocaleString()} tokens · 模型 ctx 未知
            </span>
          )}
        </div>

        <Button
          variant="outline"
          onClick={() => setMessages([])}
          disabled={loading || messages.length === 0}
        >
          清空对话
        </Button>
      </div>

      <Card className="flex-1 overflow-hidden">
        <CardContent className="flex h-full flex-col p-0">
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-6">
            {messages.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">开始对话，测试文本生成模型</p>
            )}
            {messages.map((msg, i) => {
              const isUser = msg.role === "user";
              const reasoning = msg.reasoning;
              const folded = foldedReasoning[i] ?? false;
              const isCopied = copiedIndex === i;
              return (
                <div
                  key={i}
                  className={
                    isUser
                      ? "ml-12 rounded-lg bg-primary/10 p-3 text-sm"
                      : "group relative mr-12 rounded-lg bg-secondary p-3 text-sm"
                  }
                >
                  <p className="mb-1 text-[11px] font-medium uppercase opacity-60">
                    {isUser ? "你" : "助手"}
                  </p>

                  {/* Copy button for assistant messages (hover to show) */}
                  {!isUser && msg.content && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(msg.content, i)}
                      className="absolute right-2 top-2 rounded-md border border-border bg-card p-1.5 opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100"
                      title="复制回复"
                    >
                      {isCopied ? (
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}

                  {/* Reasoning (assistant only, separately shown) */}
                  {!isUser && reasoning && (
                    <div className="mb-2 rounded-md border border-dashed border-border bg-background/40 text-xs text-muted-foreground">
                      <button
                        type="button"
                        onClick={() =>
                          setFoldedReasoning((f) => ({ ...f, [i]: !(f[i] ?? false) }))
                        }
                        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-secondary/50"
                      >
                        {folded ? (
                          <ChevronRight className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                        <Brain className="h-3 w-3" />
                        <span>思考过程</span>
                        <span className="ml-auto opacity-60">
                          {estimateTokens(reasoning).toLocaleString()} tokens
                        </span>
                      </button>
                      {!folded && (
                        <p className="whitespace-pre-wrap border-t border-dashed border-border px-2.5 py-2 leading-relaxed opacity-90">
                          {reasoning}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Final content */}
                  {msg.content ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : !isUser && reasoning && loading ? (
                    <p className="text-xs italic opacity-50">思考中…</p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-border p-4">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入消息..."
                disabled={loading}
                className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-[color:var(--primary)]"
              />
              <Button type="submit" disabled={loading || !input.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
