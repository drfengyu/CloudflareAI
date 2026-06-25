"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CATEGORIES, type CategoryId } from "@/lib/categories";
import type { NormalizedModel } from "@/lib/cloudflare/catalog";
import { cn, formatNumber } from "@/lib/utils";
import { getDisplayPrice } from "@/lib/billing/display-price";

type Filter = CategoryId | "all";

interface ChannelTab {
  id: string;
  type: string;
  name: string;
  label: string;
}

export function ModelBrowser({
  allChannels,
  modelsByChannel,
  pricingMap,
}: {
  allChannels: ChannelTab[];
  modelsByChannel: Record<string, NormalizedModel[]>;
  pricingMap?: Map<
    string,
    {
      inputPrice: number;
      outputPrice: number;
      isImage: boolean;
      fixedPrice: number;
      unit: string;
      multiplier: number;
    }
  >;
}) {
  const [activeChannel, setActiveChannel] = useState("cloudflare");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  // 当前渠道的模型
  const currentModels = useMemo(
    () => modelsByChannel[activeChannel] || [],
    [modelsByChannel, activeChannel],
  );

  // 分类计数（当前渠道内）
  const counts = useMemo(() => {
    const c: Partial<Record<CategoryId, number>> = {};
    for (const m of currentModels) c[m.category] = (c[m.category] ?? 0) + 1;
    return c;
  }, [currentModels]);

  // 过滤后的模型
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return currentModels.filter((m) => {
      if (filter !== "all" && m.category !== filter) return false;
      if (!q) return true;
      return (
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        (m.descriptionZh?.toLowerCase().includes(q) ?? false) ||
        (m.author?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [currentModels, filter, query]);

  // 分类 tab（仅当前渠道有数据的分类）
  const categoryTabs: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "全部", count: currentModels.length },
    ...CATEGORIES.filter((c) => (counts[c.id] ?? 0) > 0).map((c) => ({
      id: c.id as Filter,
      label: c.label,
      count: counts[c.id] ?? 0,
    })),
  ];

  return (
    <div className="space-y-5 p-8">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索模型 id / 名称 / 厂商 / 描述"
          className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-[color:var(--primary)]"
        />
      </div>

      {/* 渠道选项卡 */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
        {allChannels.map((ch) => (
          <button
            key={ch.id}
            onClick={() => {
              setActiveChannel(ch.id);
              setFilter("all");
            }}
            className={cn(
              "rounded-t-lg px-4 py-2 text-xs font-medium transition-colors",
              activeChannel === ch.id
                ? "border-b-2 border-[color:var(--primary)] text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-1.5">
              {ch.label}
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
                {modelsByChannel[ch.id]?.length || 0}
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* 分类选项卡（仅当前渠道有数据时显示） */}
      {currentModels.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categoryTabs.map((t) => (
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
      )}

      {/* 模型网格 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((m) => (
          <ModelCard key={m.id} model={m} pricingMap={pricingMap} />
        ))}
      </div>

      {visible.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">没有匹配的模型</p>
      )}
    </div>
  );
}

function ModelCard({
  model,
  pricingMap,
}: {
  model: NormalizedModel;
  pricingMap?: Map<
    string,
    {
      inputPrice: number;
      outputPrice: number;
      isImage: boolean;
      fixedPrice: number;
      unit: string;
      multiplier: number;
    }
  >;
}) {
  const description = model.descriptionZh ?? model.description;
  const displayPrice = getDisplayPrice(model, pricingMap);

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-2 pt-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <VendorLogo author={model.author} name={model.name} logo={model.logo} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">
                {model.name}
              </p>
              {model.author && (
                <p className="truncate text-[11px] text-muted-foreground">{model.author}</p>
              )}
            </div>
          </div>
          {/* 来源渠道标签 */}
          {model.channelSource === "cloudflare" ? (
            <Badge tone="success">CF 托管</Badge>
          ) : model.channelSource === "deepseek" ? (
            <Badge tone="accent">DeepSeek</Badge>
          ) : model.channelSource === "openai" ? (
            <Badge tone="accent">OpenAI</Badge>
          ) : model.channelSource === "anthropic" ? (
            <Badge tone="accent">Anthropic</Badge>
          ) : model.channelSource === "openai-compatible" ? (
            <Badge tone="info">{model.channelName || "兼容网关"}</Badge>
          ) : model.channelSource ? (
            <Badge tone="info">{model.channelName || model.channelSource}</Badge>
          ) : model.source === "hosted" ? (
            <Badge tone="success">CF 托管</Badge>
          ) : (
            <Badge tone="warning">第三方计费</Badge>
          )}
        </div>
        <code className="break-all text-[11px] text-muted-foreground">{model.id}</code>
        {description && (
          <p className="line-clamp-3 text-xs text-muted-foreground">{description}</p>
        )}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
          {model.tags?.map((tag) => (
            <Badge key={tag} tone={tagTone(tag)}>
              {tag}
            </Badge>
          ))}
          {model.functionCalling && !model.tags?.includes("函数调用") && (
            <Badge tone="accent">函数调用</Badge>
          )}
          {model.contextWindow ? (
            <Badge tone="muted">{formatNumber(model.contextWindow)} ctx</Badge>
          ) : null}
          {model.beta && !model.tags?.includes("测试版") && (
            <Badge tone="muted">beta</Badge>
          )}
          {displayPrice.usd !== null && (
            <Badge tone="muted" className="font-mono">
              ${displayPrice.usd.toFixed(2)}
              {displayPrice.isImage ? "" : ` / ${displayPrice.unit}`}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function VendorLogo({
  author,
  name,
  logo,
}: {
  author?: string;
  name: string;
  logo?: string;
}) {
  if (logo) {
    return (
      <img
        src={logo}
        alt={author ?? name}
        className="mt-0.5 h-6 w-6 shrink-0 rounded object-contain"
        loading="lazy"
      />
    );
  }
  const initial = (author ?? name).trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[color:var(--primary)]/10 text-[11px] font-semibold text-muted-foreground">
      {initial}
    </div>
  );
}

function tagTone(tag: string): "accent" | "warning" | "muted" {
  if (tag === "已弃用") return "warning";
  if (tag === "测试版") return "muted";
  return "accent";
}
