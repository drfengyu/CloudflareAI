"use client";

import { useState, useRef } from "react";
import { Upload, Eye, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface VisionProps {
  models: Array<{ id: string; name: string }>;
}

export function VisionPlayground({ models }: VisionProps) {
  const [selectedModel, setSelectedModel] = useState(models[0]?.id || "");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(reader.result as string);
      setResult(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!imageDataUrl || !prompt.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/ai/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          prompt: prompt.trim(),
          image: imageDataUrl,
          max_tokens: 1024,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "分析失败");

      setResult(data.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid h-full grid-cols-1 gap-4 p-8 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <label className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">模型</span>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="h-9 rounded-lg border border-border bg-card px-3 text-sm outline-none"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <p className="mb-2 text-xs text-muted-foreground">上传图片</p>
              {!imageDataUrl ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-32 w-full items-center justify-center rounded-lg border-2 border-dashed border-border bg-card hover:bg-secondary"
                >
                  <div className="text-center">
                    <Upload className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">点击上传图片</p>
                  </div>
                </button>
              ) : (
                <div className="relative">
                  <img
                    src={imageDataUrl}
                    alt="Uploaded"
                    className="w-full rounded-lg border border-border"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImageDataUrl(null);
                      setResult(null);
                      setError(null);
                    }}
                    className="absolute right-2 top-2 rounded-md bg-card p-1.5 shadow-lg hover:bg-secondary"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">问题</span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述这张图片... / 图中有什么物体？"
                rows={3}
                className="resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-[color:var(--primary)]"
              />
            </label>

            <Button
              onClick={handleAnalyze}
              disabled={loading || !imageDataUrl || !prompt.trim()}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  分析中...
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  分析图像
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5">
          <p className="mb-3 text-xs font-medium uppercase text-muted-foreground">分析结果</p>
          {!result && !error && !loading && (
            <p className="text-sm text-muted-foreground">上传图片并提问</p>
          )}
          {error && <p className="text-sm text-destructive">❌ {error}</p>}
          {result && (
            <p className="whitespace-pre-wrap text-sm">{result}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
