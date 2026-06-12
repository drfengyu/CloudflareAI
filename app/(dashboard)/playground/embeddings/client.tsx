"use client";

import { useState } from "react";
import { Binary, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function EmbeddingsClient({ models }: { models: Array<{ id: string; name: string }> }) {
  const [model, setModel] = useState(models[0]?.id || "");
  const [text, setText] = useState("");
  const [embeddings, setEmbeddings] = useState<number[][] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleEmbed(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/ai/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, text: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEmbeddings(data.embeddings.map((e: { embedding: number[] }) => e.embedding));
    } catch (err) {
      setEmbeddings(null);
      alert(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8">
      <Card>
        <CardContent className="space-y-4 pt-5">
          <label className="flex flex-col gap-2">
            <span className="text-xs text-muted">模型</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="h-9 rounded-lg border border-border bg-surface px-3 text-sm outline-none"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs text-muted">输入文本</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
          </label>

          <Button onClick={handleEmbed} disabled={loading || !text.trim()} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Binary className="h-4 w-4" />}
            生成嵌入向量
          </Button>

          {embeddings && (
            <div className="rounded-lg border border-border bg-surface-2 p-4">
              <p className="mb-2 text-xs text-muted">
                {embeddings.length} 个向量，每个维度 {embeddings[0]?.length || 0}
              </p>
              <pre className="max-h-64 overflow-auto text-[11px] text-muted">
                {JSON.stringify(embeddings[0]?.slice(0, 10), null, 2)}... (前10维)
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
