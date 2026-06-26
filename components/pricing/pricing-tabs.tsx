"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/lib/categories";

interface ChannelTab {
  id: string;
  type: string;
  name: string;
  label: string;
}

interface ModelRow {
  id: string;
  name: string;
  category: string;
  channelSource: string;
  channelName?: string;
  priceUsd: number | null;
  priceCr: number | null;
  unit: string;
  isImage: boolean;
}

const CATEGORY_NAMES: Record<string, string> = {
  text: "文本生成",
  image: "图像生成",
  vision: "图像理解",
  embeddings: "嵌入向量",
  translate: "翻译",
  speech: "语音",
  classify: "分类/检测",
  video: "视频",
};

export function PricingTabs({
  allChannels,
  modelsByChannel,
}: {
  allChannels: ChannelTab[];
  modelsByChannel: Record<string, ModelRow[]>;
}) {
  const [activeChannel, setActiveChannel] = useState("cloudflare");
  const currentModels = useMemo(
    () => modelsByChannel[activeChannel] || [],
    [modelsByChannel, activeChannel],
  );

  // 按 CATEGORIES 顺序分组
  const categories = useMemo(() => {
    const groups: Record<string, ModelRow[]> = {};
    for (const m of currentModels) {
      const cat = m.category || "text";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(m);
    }
    const ordered: Record<string, ModelRow[]> = {};
    for (const c of CATEGORIES) {
      if (groups[c.id]) {
        ordered[c.id] = [...groups[c.id]].sort((a, b) => {
          if (a.priceUsd === null) return 1;
          if (b.priceUsd === null) return -1;
          return a.priceUsd - b.priceUsd;
        });
      }
    }
    return ordered;
  }, [currentModels]);

  return (
    <div>
      {/* 渠道选项卡 */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-3 mb-6">
        {allChannels.map((ch) => {
          const count = modelsByChannel[ch.id]?.length || 0;
          return (
            <button
              key={ch.id}
              onClick={() => setActiveChannel(ch.id)}
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
                  {count}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 各分类定价表 */}
      {Object.entries(categories).map(([key, categoryModels]) => {
        if (categoryModels.length === 0) return null;
        return (
          <Card key={key} className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">
                {CATEGORY_NAMES[key] || key} ({categoryModels.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 text-left font-medium text-muted-foreground">模型</th>
                      <th className="py-2 text-left font-medium text-muted-foreground">来源</th>
                      <th className="py-2 text-right font-medium text-muted-foreground">价格</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryModels.map((model) => (
                      <tr key={model.id} className="border-b border-border/50 last:border-0">
                        <td className="py-3">
                          <div>
                            <p className="font-medium">{model.name}</p>
                            <code className="text-xs text-muted-foreground">{model.id}</code>
                          </div>
                        </td>
                        <td className="py-3">
                          <ChannelBadge channelSource={model.channelSource} channelName={model.channelName} />
                        </td>
                        <td className="py-3 text-right">
                          {model.priceUsd !== null ? (
                            <div>
                              <p className="font-medium">${model.priceUsd.toFixed(4)}</p>
                              <p className="text-xs text-muted-foreground">
                                {model.priceCr?.toLocaleString()} cr
                              </p>
                              <p className="text-xs text-muted-foreground">/ {model.unit}</p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ChannelBadge({ channelSource, channelName }: { channelSource?: string; channelName?: string }) {
  if (channelSource === "cloudflare") return <Badge tone="success">CF 托管</Badge>;
  if (channelSource === "deepseek") return <Badge tone="accent">DeepSeek</Badge>;
  if (channelSource === "openai") return <Badge tone="accent">OpenAI</Badge>;
  if (channelSource === "anthropic") return <Badge tone="accent">Anthropic</Badge>;
  if (channelSource && channelName) return <Badge tone="info">{channelName}</Badge>;
  if (channelSource) return <Badge tone="info">{channelSource}</Badge>;
  return <Badge tone="muted">—</Badge>;
}
