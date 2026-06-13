"use client";

import { useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const LANGS = [
  { code: "zh", label: "中文" },
  { code: "en", label: "英语" },
  { code: "es", label: "西班牙语" },
  { code: "fr", label: "法语" },
  { code: "de", label: "德语" },
  { code: "ja", label: "日语" },
  { code: "ko", label: "韩语" },
];

export function TranslateClient({ models }: { models: Array<{ id: string; name: string }> }) {
  const [model, setModel] = useState(models[0]?.id || "");
  const [text, setText] = useState("");
  const [targetLang, setTargetLang] = useState("en");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleTranslate(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, text: text.trim(), target_lang: targetLang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data.text);
    } catch (err) {
      setResult(`❌ ${err instanceof Error ? err.message : "翻译失败"}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8">
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">模型</span>
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
              <span className="text-xs text-muted-foreground">目标语言</span>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="h-9 rounded-lg border border-border bg-surface px-3 text-sm outline-none"
              >
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground">原文</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none"
            />
          </label>

          <Button onClick={handleTranslate} disabled={loading || !text.trim()} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
            翻译
          </Button>

          {result && (
            <div className="rounded-lg border border-border bg-surface-2 p-4">
              <p className="mb-1 text-xs text-muted-foreground">译文</p>
              <p className="whitespace-pre-wrap text-sm">{result}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
