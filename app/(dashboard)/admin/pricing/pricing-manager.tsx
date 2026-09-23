"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { updateModelMultiplier, updateModelReserve } from "./actions";
import { toast } from "sonner";
import { formatModelPrice } from "@/lib/billing/display-price";

const CATEGORY_LABELS: Record<string, string> = {
  text: "文本生成",
  image: "图像生成",
  vision: "图像理解",
  embeddings: "嵌入向量",
  translate: "翻译",
  speech: "语音",
  classify: "分类/检测",
  video: "视频",
  remote: "远程渠道",
};

type ModelWithPricing = {
  id: string;
  name: string;
  category: string;
  source: string;
  channelSource?: string;
  channelId?: string;
  pricing?: {
    category: string | null;
    source: string | null;
    inputPrice: number | null;
    outputPrice: number | null;
    unit: string | null;
    isImage: boolean;
    fixedPrice: number | null;
    multiplier: number;
    /** 余额预检的输出预留档位（token 数），null = 用默认 1024 */
    reserveOutputTokens: number | null;
    updatedAt: Date | null;
  };
};

interface PricingManagerProps {
  models: ModelWithPricing[];
  /** 全局基础倍率（pricing_base_multiplier），实付单价 = 表价 × 模型倍率 × 它 */
  baseMultiplier: number;
  /** 是否从服务端传入了渠道模型 */
  channelModels?: ModelWithPricing[];
  /** 渠道列表 */
  channels?: { id: string; name: string; type: string; label: string }[];
  /** 当前选中的渠道 */
  activeChannel?: string;
  /** 切换渠道 */
  onChannelChange?: (id: string) => void;
}

export function PricingManager({
  models = [],
  baseMultiplier,
  channelModels = [],
  channels = [],
  activeChannel = "cloudflare",
  onChannelChange,
}: PricingManagerProps) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [localActiveChannel, setLocalActiveChannel] = useState(activeChannel);

  const currentChannel = onChannelChange ? activeChannel : localActiveChannel;
  const setCurrentChannel = onChannelChange || setLocalActiveChannel;

  // 合并所有渠道的模型
  const allChannelTabs = [
    { id: "cloudflare", name: "Cloudflare Workers AI", type: "cloudflare", label: "Cloudflare" },
    ...channels.filter((c) => c.type !== "cloudflare"),
  ];

  const currentModels = useMemo(() => {
    if (currentChannel === "cloudflare") return models;
    return channelModels.filter((m) => m.channelId === currentChannel || m.channelSource === currentChannel);
  }, [currentChannel, models, channelModels]);

  // 分类
  const categories = useMemo(() => {
    const cats = new Set(currentModels.map((m) => m.category));
    return Array.from(cats).sort();
  }, [currentModels]);

  // 过滤
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return currentModels.filter((m) => {
      if (categoryFilter !== "all" && m.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q)
      );
    });
  }, [currentModels, query, categoryFilter]);

  return (
    <div className="space-y-5 p-8">
      {/* 渠道选项卡 */}
      {allChannelTabs.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
          {allChannelTabs.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setCurrentChannel(ch.id)}
              className={cn(
                "rounded-t-lg px-4 py-2 text-xs font-medium transition-colors",
                currentChannel === ch.id
                  ? "border-b-2 border-[color:var(--primary)] text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {ch.label}
            </button>
          ))}
        </div>
      )}

      {/* Search + Category filter */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索模型 ID / 名称"
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-[color:var(--primary)]"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-[color:var(--primary)]"
        >
          <option value="all">全部分类</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat] || cat} ({currentModels.filter((m) => m.category === cat).length})
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">{visible.length} 个模型</span>
      </div>

      {/* 模型列表 */}
      <div className="space-y-2">
        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">没有匹配的模型</p>
        ) : (
          visible.map((model) => (
            <ModelPricingRow key={model.id} model={model} baseMultiplier={baseMultiplier} />
          ))
        )}
      </div>
    </div>
  );
}

function ModelPricingRow({
  model,
  baseMultiplier,
}: {
  model: ModelWithPricing;
  baseMultiplier: number;
}) {
  const [multiplier, setMultiplier] = useState(String(model.pricing?.multiplier ?? 1.0));
  const [reserve, setReserve] = useState(String(model.pricing?.reserveOutputTokens ?? 1024));
  const [saving, setSaving] = useState(false);

  const p = model.pricing;
  const storedPrice = p ? (p.isImage ? (p.fixedPrice ?? 0) : (p.inputPrice ?? 0)) : 0;
  // 表价：已含基础倍率，与 /pricing 上给用户看的单价同源
  const displayPrice = p ? formatModelPrice(storedPrice, p.isImage, baseMultiplier) : "—";
  // 实付：表价再乘这一行的模型倍率
  const finalPrice = p
    ? formatModelPrice(
        storedPrice * (parseFloat(multiplier) || 1),
        p.isImage,
        baseMultiplier,
      )
    : "—";

  async function handleSave() {
    const val = parseFloat(multiplier);
    if (isNaN(val) || val < 0.01 || val > 100) {
      toast.error("倍率必须在 0.01 到 100 之间");
      return;
    }
    const reserveVal = parseInt(reserve, 10);
    if (!Number.isInteger(reserveVal) || reserveVal < 1 || reserveVal > 128_000) {
      toast.error("预检预留必须在 1 到 128000 token 之间");
      return;
    }

    const jobs: Promise<{ success: boolean; error?: string }>[] = [];
    if (val !== (model.pricing?.multiplier ?? 1)) jobs.push(updateModelMultiplier(model.id, val));
    if (reserveVal !== (model.pricing?.reserveOutputTokens ?? 1024)) {
      jobs.push(updateModelReserve(model.id, reserveVal));
    }
    if (jobs.length === 0) {
      toast("没有改动");
      return;
    }

    setSaving(true);
    try {
      const failed = (await Promise.all(jobs)).find((r) => !r.success);
      if (failed) throw new Error(failed.error);
      toast.success(`已更新：倍率 ${val}x · 预检预留 ${reserveVal} tokens`);
    } catch (err) {
      toast.error((err as Error).message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{model.name}</p>
            <Badge tone="muted" className="text-[10px]">{model.source}</Badge>
            {model.channelSource && model.channelSource !== "cloudflare" && (
              <Badge tone="accent" className="text-[10px]">{model.channelSource}</Badge>
            )}
          </div>
          <code className="text-xs text-muted-foreground block truncate">{model.id}</code>
        </div>

        <div className="hidden md:block text-right text-xs text-muted-foreground min-w-[120px]">
          <div>表价: {displayPrice}</div>
          <div>实付: <span className="text-foreground font-medium">{finalPrice}</span></div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="100"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              title="模型倍率：实付单价 = 表价 × 它"
              className="h-8 w-20 rounded border border-border bg-card px-2 text-xs text-right outline-none focus:border-[color:var(--primary)]"
            />
            <span className="text-xs text-muted-foreground">x</span>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="1"
              min="1"
              max="128000"
              value={reserve}
              onChange={(e) => setReserve(e.target.value)}
              title="余额预检假定的输出 token 数：客户端 max_tokens 超过它时按它算，避免默认 32000 的客户端被全量预留挡在 402"
              className="h-8 w-20 rounded border border-border bg-card px-2 text-xs text-right outline-none focus:border-[color:var(--primary)]"
            />
            <span className="text-xs text-muted-foreground">tk</span>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "h-8 rounded-md px-3 text-xs font-medium transition-colors",
              "bg-[color:var(--primary)] text-white hover:opacity-90 disabled:opacity-50",
            )}
          >
            {saving ? "..." : "保存"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
