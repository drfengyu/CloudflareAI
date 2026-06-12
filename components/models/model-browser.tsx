"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CATEGORIES, type CategoryId } from "@/lib/categories";
import type { NormalizedModel } from "@/lib/cloudflare/catalog";
import { cn, formatNumber } from "@/lib/utils";

type Filter = CategoryId | "all";

export function ModelBrowser({ models }: { models: NormalizedModel[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Partial<Record<CategoryId, number>> = {};
    for (const m of models) c[m.category] = (c[m.category] ?? 0) + 1;
    return c;
  }, [models]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      if (filter !== "all" && m.category !== filter) return false;
      if (!q) return true;
      return (
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
      );
    });
  }, [models, filter, query]);

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "全部", count: models.length },
    ...CATEGORIES.filter((c) => (counts[c.id] ?? 0) > 0).map((c) => ({
      id: c.id as Filter,
      label: c.label,
      count: counts[c.id] ?? 0,
    })),
  ];

  return (
    <div className="space-y-5 p-8">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索模型 id / 名称 / 描述"
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
                : "border-border text-muted hover:text-foreground",
            )}
          >
            {t.label}
            <span className="ml-1.5 opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((m) => (
          <ModelCard key={m.id} model={m} />
        ))}
      </div>

      {visible.length === 0 && (
        <p className="py-12 text-center text-sm text-muted">没有匹配的模型</p>
      )}
    </div>
  );
}

function ModelCard({ model }: { model: NormalizedModel }) {
  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-2 pt-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-tight">{model.name}</p>
          {model.source === "hosted" ? (
            <Badge tone="success">CF 托管</Badge>
          ) : (
            <Badge tone="warning">第三方计费</Badge>
          )}
        </div>
        <code className="break-all text-[11px] text-muted">{model.id}</code>
        {model.description && (
          <p className="line-clamp-3 text-xs text-muted">{model.description}</p>
        )}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
          {model.functionCalling && <Badge tone="accent">函数调用</Badge>}
          {model.contextWindow ? (
            <Badge tone="muted">
              {formatNumber(model.contextWindow)} ctx
            </Badge>
          ) : null}
          {model.beta && <Badge tone="muted">beta</Badge>}
          {model.pricing[0] && (
            <Badge tone="muted">
              ${model.pricing[0].price} / {model.pricing[0].unit}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
