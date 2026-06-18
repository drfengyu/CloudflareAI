"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ModelOption {
  id: string;
  name: string;
  channel?: string;
}

interface TextGenProps {
  models: ModelOption[];
}

export function TextGenPlayground({ models }: TextGenProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(models[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

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
          max_tokens: maxTokens,
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
      let assistantMsg = "";

      setMessages((m) => [...m, { role: "assistant", content: "" }]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.trim().startsWith("data:"));

        for (const line of lines) {
          const data = line.replace(/^data:\s*/, "");
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantMsg += delta;
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: assistantMsg };
                return copy;
              });
            }
          } catch {
            // ignore parse errors
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
            className="h-8 min-w-[280px] rounded-lg border border-border bg-surface px-2 text-sm outline-none"
          >
            <optgroup label="Cloudflare 托管">
              {models.filter(m => m.channel === "cloudflare" || !m.channel).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
            {models.filter(m => m.channel && m.channel !== "cloudflare").length > 0 && (
              <optgroup label="第三方渠道">
                {models.filter(m => m.channel && m.channel !== "cloudflare").map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} [{m.channel}]
                  </option>
                ))}
              </optgroup>
            )}
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
            className="h-8 w-20 rounded-lg border border-border bg-surface px-2 text-sm outline-none"
          />
        </label>

        <label className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">最大 tokens</span>
          <input
            type="number"
            value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
            min="1"
            max="32768"
            step="256"
            className="h-8 w-24 rounded-lg border border-border bg-surface px-2 text-sm outline-none"
          />
        </label>

        <Button
          variant="outline"
          onClick={() => setMessages([])}
          disabled={loading || messages.length === 0}
          className="ml-auto"
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
            {messages.map((msg, i) => (
              <div
                key={i}
                className={
                  msg.role === "user"
                    ? "ml-12 rounded-lg bg-primary/10 p-3 text-sm"
                    : "mr-12 rounded-lg bg-surface-2 p-3 text-sm"
                }
              >
                <p className="mb-1 text-[11px] font-medium uppercase opacity-60">
                  {msg.role === "user" ? "你" : "助手"}
                </p>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}
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
