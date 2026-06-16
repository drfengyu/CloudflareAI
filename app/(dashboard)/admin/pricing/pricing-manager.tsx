"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { updateModelMultiplier } from "./actions";
import { toast } from "sonner";

type ModelWithPricing = {
  id: string;
  name: string;
  category: string;
  source: string;
  pricing?: {
    category: string | null;
    source: string | null;
    inputPrice: number | null;
    outputPrice: number | null;
    unit: string | null;
    isImage: boolean;
    fixedPrice: number | null;
    multiplier: number;
    updatedAt: Date | null;
  };
};

type Filter = "all" | "text" | "image" | "vision" | "embeddings" | "translate" | "speech" | "video";

export function PricingManager({ models }: { models: ModelWithPricing[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const counts = useMemo(() => {
    const c: Partial<Record<Filter, number>> = {};
    for (const m of models) {
      const cat = m.category as Filter;
      c[cat] = (c[cat] ?? 0) + 1;
    }
    return c;
  }, [models]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      if (filter !== "all" && m.category !== filter) return false;
      if (!q) return true;
      return (
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q)
      );
    });
  }, [models, filter, query]);

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: "all" as const, label: "全部", count: models.length },
    { id: "text" as const, label: "文本生成", count: counts.text ?? 0 },
    { id: "image" as const, label: "图像生成", count: counts.image ?? 0 },
    { id: "vision" as const, label: "图像理解", count: counts.vision ?? 0 },
    { id: "embeddings" as const, label: "嵌入向量", count: counts.embeddings ?? 0 },
    { id: "translate" as const, label: "翻译", count: counts.translate ?? 0 },
    { id: "speech" as const, label: "语音", count: counts.speech ?? 0 },
    { id: "video" as const, label: "视频", count: counts.video ?? 0 },
  ].filter((t) => t.id === "all" || (t.count ?? 0) > 0);

  const handleEdit = (modelId: string, currentMultiplier: number) => {
    setEditingId(modelId);
    setEditValue(currentMultiplier.toString());
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValue("");
  };

  const handleSave = async (modelId: string) => {
    const multiplier = parseFloat(editValue);
    if (isNaN(multiplier) || multiplier < 0.01 || multiplier > 100) {
      toast.error("倍率必须在 0.01 ~ 100 之间");
      return;
    }

    setSaving(true);
    try {
      const result = await updateModelMultiplier(modelId, multiplier);
      if (result.success) {
        toast.success("更新成功");
        setEditingId(null);
        setEditValue("");
        // 刷新页面以获取最新数据
        window.location.reload();
      } else {
        toast.error(result.error ?? "更新失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 p-8">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索模型 id / 名称"
          className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-[color:var(--primary)]"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              filter === t.id
                ? "border-[color:var(--primary)] bg-[color:var(--primary)]/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            <span className="ml-1.5 opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {visible.map((m) => {
          const pricing = m.pricing;
          const isEditing = editingId === m.id;

          return (
            <Card key={m.id}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <Badge tone={m.source === "hosted" ? "success" : "warning"}>
                      {m.source}
                    </Badge>
                  </div>
                  <code className="text-[11px] text-muted-foreground">{m.id}</code>
                  {pricing && (
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        基础价：
                        {pricing.isImage
                          ? `$${((pricing.fixedPrice ?? 0) / (pricing.multiplier || 1)).toFixed(2)}/张`
                          : `$${((pricing.inputPrice ?? 0) / (pricing.multiplier || 1)).toFixed(2)}/1M`}
                      </span>
                      <span>→</span>
                      <span className="font-medium text-foreground">
                        最终价：
                        {pricing.isImage
                          ? `$${(pricing.fixedPrice ?? 0).toFixed(2)}/张`
                          : `$${(pricing.inputPrice ?? 0).toFixed(2)}/1M`}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max="100"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        disabled={saving}
                        className="h-8 w-24 rounded border border-border bg-surface px-2 text-sm outline-none focus:border-[color:var(--primary)]"
                      />
                      <button
                        onClick={() => handleSave(m.id)}
                        disabled={saving}
                        className="h-8 rounded bg-[color:var(--primary)] px-3 text-sm text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {saving ? "保存中..." : "保存"}
                      </button>
                      <button
                        onClick={handleCancel}
                        disabled={saving}
                        className="h-8 rounded border border-border px-3 text-sm hover:bg-surface disabled:opacity-50"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-mono font-medium">
                        ×{pricing?.multiplier?.toFixed(2) ?? "1.00"}
                      </span>
                      <button
                        onClick={() => handleEdit(m.id, pricing?.multiplier ?? 1.0)}
                        className="h-8 rounded border border-border px-3 text-sm hover:bg-surface"
                      >
                        调整
                      </button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">没有匹配的模型</p>
      )}
    </div>
  );
}
