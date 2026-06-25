"use client";

import { useState } from "react";
import { Wand2, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ImageGenProps {
  models: Array<{ id: string; name: string }>;
}

export function ImageGenPlayground({ models }: ImageGenProps) {
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState(models[0]?.id || "");
  const [numSteps, setNumSteps] = useState(20);
  const [guidance, setGuidance] = useState(7.5);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setError(null);
    setImageUrl(null);

    try {
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          prompt: prompt.trim(),
          num_steps: numSteps,
          guidance,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");

      setImageUrl(data.image);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `cf-ai-${Date.now()}.png`;
    a.click();
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

            <label className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">提示词</span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述你想生成的图像..."
                rows={4}
                className="resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-[color:var(--primary)]"
              />
            </label>

            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">推理步数 ({numSteps})</span>
                <input
                  type="range"
                  value={numSteps}
                  onChange={(e) => setNumSteps(parseInt(e.target.value, 10))}
                  min="1"
                  max="50"
                  className="h-2 cursor-pointer appearance-none rounded-lg bg-border accent-primary"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">引导强度 ({guidance})</span>
                <input
                  type="range"
                  value={guidance}
                  onChange={(e) => setGuidance(parseFloat(e.target.value))}
                  min="0"
                  max="20"
                  step="0.5"
                  className="h-2 cursor-pointer appearance-none rounded-lg bg-border accent-primary"
                />
              </label>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  生成图像
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="flex items-center justify-center">
        <CardContent className="w-full pt-5">
          {!imageUrl && !error && !loading && (
            <p className="text-center text-sm text-muted-foreground">
              输入提示词并生成图像
            </p>
          )}
          {error && (
            <p className="text-center text-sm text-destructive">❌ {error}</p>
          )}
          {imageUrl && (
            <div className="space-y-3">
              <img
                src={imageUrl}
                alt="Generated"
                className="w-full rounded-lg border border-border"
              />
              <Button onClick={handleDownload} variant="outline" className="w-full">
                <Download className="h-4 w-4" />
                下载图像
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
