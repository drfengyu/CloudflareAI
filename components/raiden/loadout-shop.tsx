"use client";

import { Bomb, Heart, Minus, Plus, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCredits } from "@/lib/billing/credits";
import {
  RAIDEN_ITEMS,
  type RaidenConfig,
  type RaidenItemKey,
  type RaidenLoadout,
} from "@/lib/raiden/config";

const ITEM_ICON: Record<RaidenItemKey, React.ComponentType<{ className?: string }>> = {
  weapon: Zap,
  bomb: Bomb,
  shield: Shield,
  life: Heart,
};

/** 全屏准备界面里的紧凑装备面板。价格与服务端同一份配置。 */
export function LoadoutShop({
  config,
  loadout,
  onChange,
}: {
  config: RaidenConfig;
  loadout: RaidenLoadout;
  onChange: (loadout: RaidenLoadout) => void;
}) {
  const setCount = (key: "weapon" | "bomb" | "life", delta: number) => {
    const max = config.items[key].max;
    const next = Math.max(0, Math.min(max, loadout[key] + delta));
    onChange({ ...loadout, [key]: next });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-white/85">出击装备</p>
        <p className="text-[10px] text-white/40">装备费在出击时扣除</p>
      </div>

      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {RAIDEN_ITEMS.map((item) => {
          const price = config.items[item.key].price;
          const max = config.items[item.key].max;
          const Icon = ITEM_ICON[item.key];
          const isToggle = item.kind === "toggle";
          const countKey = item.key as "weapon" | "bomb" | "life";
          const active = isToggle ? loadout.shield : loadout[countKey] > 0;
          const count = isToggle ? (loadout.shield ? 1 : 0) : loadout[countKey];

          return (
            <div
              key={item.key}
              className={cn(
                "rounded-lg border px-3 py-2.5 transition-colors",
                active
                  ? "border-cyan-400/45 bg-cyan-400/[0.07]"
                  : "border-white/10 bg-white/[0.03]",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cyan-400/10 text-cyan-300">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-white">{item.title}</p>
                    <p className="text-[10px] text-white/40">
                      {formatCredits(price)} cr
                      {isToggle ? " / 出击" : " / 份"}
                      {max > 1 ? ` · 上限 ${max}` : ""}
                    </p>
                  </div>
                </div>
                {isToggle ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={loadout.shield ? "secondary" : "outline"}
                    className={cn(
                      "h-7 shrink-0 px-2.5 text-[11px]",
                      !loadout.shield && "border-white/15 bg-white/5 text-white/70 hover:bg-white/10",
                    )}
                    onClick={() => onChange({ ...loadout, shield: !loadout.shield })}
                    disabled={max <= 0}
                  >
                    {loadout.shield ? "已装" : "装备"}
                  </Button>
                ) : (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      aria-label={`减少${item.title}`}
                      onClick={() => setCount(countKey, -1)}
                      disabled={count <= 0}
                      className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-5 text-center font-mono text-xs">{count}</span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      aria-label={`增加${item.title}`}
                      onClick={() => setCount(countKey, 1)}
                      disabled={count >= max}
                      className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-white/45">{item.hint}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] leading-relaxed text-white/45">
        <p>
          <span className="text-white/70">键盘：</span>方向键 / WASD 移动 · X / K / 空格 放炸弹 · P / Esc
          暂停
        </p>
        <p className="mt-0.5">
          <span className="text-white/70">触屏：</span>画面内拖动移动 · 右下角按钮放炸弹 · 自动射击
        </p>
        <p className="mt-0.5">
          <span className="text-white/70">掉落：</span>W 火力 · S 散射 · M 追踪导弹 · B 炸弹 · 金色 cr 战利品
        </p>
        <p className="mt-0.5">
          <span className="text-white/70">战机：</span>100 HP 起，受击扣血；每击破 25 架或进入新关卡 HP 回满。
        </p>
      </div>
    </div>
  );
}
