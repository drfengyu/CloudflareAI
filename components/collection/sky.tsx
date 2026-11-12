"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Gem,
  Gift,
  Loader2,
  PackageOpen,
  Sparkles,
  Telescope,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CouponCount } from "@/components/activity/coupon-badge";
import { formatCredits } from "@/lib/billing/credits";
import { cn } from "@/lib/utils";
import {
  CRAFT_SHARDS,
  CONSTELLATION_SHARDS,
  MELT_SHARDS,
  STAR_BRIGHTNESS_NAMES,
  STAR_COLORS,
  STAR_COLOR_META,
  nodeById,
  type Constellation,
  type StarColor,
} from "@/lib/collection/config";
import type { CollectionState } from "@/lib/collection/state";
import {
  claimCollectionMilestonesAction,
  claimResonanceAction,
  craftStarAction,
  meltStarAction,
  observeSkyAction,
  placeStarAction,
} from "@/app/(dashboard)/collection/actions";

interface SkyProps {
  initial: CollectionState;
  constellations: Constellation[];
  dailyObserves: number;
  priceTickets: number;
  couponTickets: number;
  setRewards: { set: string; reward: number }[];
  grantedSets: string[];
  resonanceReward: number;
  today: string;
}

const BRIGHTNESS: Array<1 | 2 | 3> = [1, 2, 3];

function StarMap({
  constellation,
  lit,
  selectedId,
  onSelect,
}: {
  constellation: Constellation;
  lit: Set<string>;
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
}) {
  const nodes = new Map(constellation.nodes.map((node) => [node.id, node]));
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(circle at 20% 15%, rgba(125,211,252,0.16), transparent 40%), radial-gradient(circle at 80% 75%, rgba(94,234,212,0.14), transparent 45%), radial-gradient(circle at 55% 45%, rgba(251,191,36,0.10), transparent 55%)",
        }}
      />
      <svg viewBox="0 0 100 100" className="relative block h-auto w-full">
        <defs>
          <filter id={`glow-${constellation.key}`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {constellation.edges.map(([a, b]) => {
          const left = nodes.get(a);
          const right = nodes.get(b);
          if (!left || !right) return null;
          const active = lit.has(a) && lit.has(b);
          const hex = STAR_COLOR_META[left.color].hex;
          return (
            <line
              key={`${a}-${b}`}
              x1={left.x}
              y1={left.y}
              x2={right.x}
              y2={right.y}
              stroke={active ? hex : "#334155"}
              strokeWidth={active ? 0.7 : 0.35}
              strokeLinecap="round"
              opacity={active ? 0.85 : 0.45}
            />
          );
        })}
        {constellation.nodes.map((node) => {
          const on = lit.has(node.id);
          const hex = STAR_COLOR_META[node.color].hex;
          const radius = 1.7 + node.brightness * 0.45;
          const isSelected = selectedId === node.id;
          return (
            <g
              key={node.id}
              role="button"
              tabIndex={0}
              aria-label={`${STAR_COLOR_META[node.color].name}${STAR_BRIGHTNESS_NAMES[node.brightness]}星位`}
              onClick={() => onSelect(node.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelect(node.id);
              }}
              className="cursor-pointer outline-none"
            >
              {on ? (
                <circle cx={node.x} cy={node.y} r={radius + 3.4} fill={hex} opacity={0.18} />
              ) : null}
              {BRIGHTNESS.slice(0, node.brightness).map((_, index) => (
                <circle
                  key={index}
                  cx={node.x}
                  cy={node.y}
                  r={radius + 0.9 + index * 1.15}
                  fill="none"
                  stroke={hex}
                  strokeWidth={0.22}
                  opacity={on ? 0.5 : 0.22}
                />
              ))}
              <circle
                cx={node.x}
                cy={node.y}
                r={radius}
                fill={on ? hex : "#0f172a"}
                stroke={hex}
                strokeWidth={0.45}
                opacity={on ? 1 : 0.8}
                filter={on ? `url(#glow-${constellation.key})` : undefined}
              />
              {isSelected ? (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={radius + 4.6}
                  fill="none"
                  stroke="#f8fafc"
                  strokeWidth={0.3}
                  strokeDasharray="1.4 1.4"
                  opacity={0.9}
                />
              ) : null}
              {/* 透明命中区，手机上也点得中 */}
              <circle cx={node.x} cy={node.y} r={6} fill="transparent" />
            </g>
          );
        })}
      </svg>
      <p className="absolute bottom-2 left-3 text-[11px] text-slate-400">
        点击星位查看要求 · 亮环数量 = 所需亮度
      </p>
    </div>
  );
}

export function CollectionSky(props: SkyProps) {
  const router = useRouter();
  const [state, setState] = useState<CollectionState>(props.initial);
  const [granted, setGranted] = useState<string[]>(props.grantedSets);
  const [activeKey, setActiveKey] = useState(() => {
    const firstOpen = props.constellations.find(
      (item) => !item.nodes.every((node) => props.initial.nodes.includes(node.id)),
    );
    return firstOpen?.key ?? props.constellations[0]?.key ?? "";
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [craftColor, setCraftColor] = useState<StarColor>("blue");
  const [craftBrightness, setCraftBrightness] = useState<1 | 2 | 3>(1);

  const lit = new Set(state.nodes);
  const active =
    props.constellations.find((item) => item.key === activeKey) ?? props.constellations[0];
  const completedKeys = props.constellations
    .filter((item) => item.nodes.every((node) => lit.has(node.id)))
    .map((item) => item.key);
  const rewardFor = (key: string) => props.setRewards.find((item) => item.set === key)?.reward ?? 0;
  const claimable = completedKeys.filter((key) => rewardFor(key) > 0 && !granted.includes(key));
  const selectedNode = selectedId ? nodeById(selectedId) : null;
  const resonanceReady = completedKeys.length > 0 && state.resonanceDay !== props.today;
  const resonanceValue = completedKeys.length * props.resonanceReward;
  const craftCost = CRAFT_SHARDS[craftBrightness];
  const canObserve =
    state.observesToday < props.dailyObserves && props.couponTickets >= props.priceTickets;

  function applyState(next: CollectionState) {
    setState(next);
  }

  async function handleObserve() {
    if (busy) return;
    setBusy("observe");
    const res = await observeSkyAction();
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    applyState(res.data.state);
    toast.success(
      `观星得到 ${res.data.colorName}${res.data.brightnessName}星石（当前 ${res.data.owned} / ${props.dailyObserves} 次）`,
    );
    router.refresh();
  }

  async function handlePlace() {
    if (!selectedNode || busy) return;
    setBusy("place");
    const res = await placeStarAction({ nodeId: selectedNode.id });
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    applyState(res.data.state);
    setGranted((prev) => [...new Set([...prev, ...res.data.completedSets])]);
    toast.success(`点亮了${STAR_COLOR_META[res.data.color].name}星位`);
    if (res.data.shardsGained > 0) {
      toast.success(`星座连成，额外 +${res.data.shardsGained} 星辉`);
    }
    if (res.data.milestoneReward > 0) {
      toast.success(`完成星座，获得 ${formatCredits(res.data.milestoneReward)} tcr`);
    }
    if (lit.has(selectedNode.id)) setSelectedId(null);
    router.refresh();
  }

  async function handleMelt(color: StarColor, brightness: 1 | 2 | 3) {
    if (busy) return;
    setBusy(`melt-${color}-${brightness}`);
    const res = await meltStarAction({ color, brightness });
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    applyState(res.data.state);
    toast.success(`熔炼 ${STAR_COLOR_META[color].name}${STAR_BRIGHTNESS_NAMES[brightness]}星石，+${res.data.shardsGained} 星辉`);
    router.refresh();
  }

  async function handleCraft() {
    if (busy) return;
    setBusy("craft");
    const res = await craftStarAction({ color: craftColor, brightness: craftBrightness });
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    applyState(res.data.state);
    toast.success(`凝出 ${STAR_COLOR_META[craftColor].name}${STAR_BRIGHTNESS_NAMES[craftBrightness]}星石`);
    router.refresh();
  }

  async function handleResonance() {
    if (busy) return;
    setBusy("resonance");
    const res = await claimResonanceAction();
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    applyState(res.data.state);
    if (res.data.reward > 0) {
      toast.success(`星图共鸣，获得 ${formatCredits(res.data.reward)} tcr`);
    } else {
      toast.message("共鸣完成，但奖励为 0");
    }
    router.refresh();
  }

  async function handleClaim() {
    if (busy) return;
    setBusy("claim");
    const res = await claimCollectionMilestonesAction();
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    if (res.data.reward > 0) {
      toast.success(`补领 ${formatCredits(res.data.reward)} tcr`);
      setGranted((prev) => [...new Set([...prev, ...res.data.sets])]);
      router.refresh();
    } else {
      toast.message("没有可补领的星座奖励");
    }
  }

  const selectedStock = selectedNode
    ? state.stones[selectedNode.color].slice(selectedNode.brightness - 1).reduce((sum, n) => sum + n, 0)
    : 0;
  const selectedLit = selectedNode ? lit.has(selectedNode.id) : false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {props.constellations.map((item) => {
          const count = item.nodes.filter((node) => lit.has(node.id)).length;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setActiveKey(item.key);
                setSelectedId(null);
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                item.key === active?.key
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {item.name}
              <span className="text-xs tabular-nums">
                {count}/{item.nodes.length}
              </span>
            </button>
          );
        })}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          星辉 {state.shards} · 今日观星 {state.observesToday} / {props.dailyObserves}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
            <Button type="button" onClick={() => void handleObserve()} disabled={!canObserve || busy !== null}>
              {busy === "observe" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Telescope className="h-4 w-4" />
              )}
              观星
            </Button>
            <span className="text-sm text-muted-foreground">
              花 <CouponCount kind="collection" count={props.priceTickets} /> 观星一次；可用{" "}
              {props.couponTickets} 张
            </span>
            {!canObserve ? (
              <span className="text-xs text-destructive">
                {state.observesToday >= props.dailyObserves ? "今日观星次数已用完" : "星图券不足，请先兑换"}
              </span>
            ) : null}
          </div>

          {active ? (
            <div>
              <p className="mb-2 text-sm text-muted-foreground">{active.subtitle}</p>
              <StarMap
                constellation={active}
                lit={lit}
                selectedId={selectedId}
                onSelect={(nodeId) => {
                  setSelectedId(nodeId);
                  const owner = props.constellations.find((item) =>
                    item.nodes.some((node) => node.id === nodeId),
                  );
                  if (owner) setActiveKey(owner.key);
                }}
              />
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                {STAR_COLORS.map((color) => (
                  <span key={color} className="inline-flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: STAR_COLOR_META[color].hex }}
                    />
                    {STAR_COLOR_META[color].name}
                  </span>
                ))}
                <span>· 星位完成后额外 +{CONSTELLATION_SHARDS} 星辉</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-border p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-3.5 w-3.5" /> 星位
            </p>
            {selectedNode ? (
              <div className="mt-2 space-y-2">
                <p className="text-sm">
                  {STAR_COLOR_META[selectedNode.color].name}
                  {STAR_BRIGHTNESS_NAMES[selectedNode.brightness]}星位
                </p>
                <p className="text-xs text-muted-foreground">
                  需要 {STAR_COLOR_META[selectedNode.color].name}
                  {STAR_BRIGHTNESS_NAMES[selectedNode.brightness]}以上星石；当前可用 {selectedStock} 颗
                </p>
                {selectedLit ? (
                  <p className="text-xs text-success">已点亮</p>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handlePlace()}
                    disabled={selectedStock <= 0 || busy !== null}
                  >
                    {busy === "place" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    嵌入星石
                  </Button>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">点击左侧星图上的星位，查看它的颜色与亮度要求。</p>
            )}
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="flex items-center justify-between gap-2 text-sm font-medium">
              <span className="flex items-center gap-1.5">
                <Gem className="h-3.5 w-3.5" /> 星石库存
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">星辉 {state.shards}</span>
            </p>
            <div className="mt-2 space-y-2">
              {STAR_COLORS.map((color) => (
                <div key={color} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: STAR_COLOR_META[color].hex }}
                  />
                  <span className="w-10 shrink-0 text-xs text-muted-foreground">
                    {STAR_COLOR_META[color].name}
                  </span>
                  <div className="grid flex-1 grid-cols-3 gap-1.5">
                    {BRIGHTNESS.map((brightness) => {
                      const count = state.stones[color][brightness - 1] ?? 0;
                      return (
                        <div
                          key={brightness}
                          className="rounded-md border border-border px-1.5 py-1 text-center"
                        >
                          <p className="text-[10px] text-muted-foreground">
                            {STAR_BRIGHTNESS_NAMES[brightness]}
                          </p>
                          <p className="text-sm font-semibold tabular-nums">{count}</p>
                          <button
                            type="button"
                            onClick={() => void handleMelt(color, brightness)}
                            disabled={count <= 0 || busy !== null}
                            className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-40"
                          >
                            熔 +{MELT_SHARDS[brightness]}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">凝星：用星辉定向凝出一颗</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {STAR_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setCraftColor(color)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs",
                      craftColor === color
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {STAR_COLOR_META[color].name}
                  </button>
                ))}
                {BRIGHTNESS.map((brightness) => (
                  <button
                    key={brightness}
                    type="button"
                    onClick={() => setCraftBrightness(brightness)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs",
                      craftBrightness === brightness
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {STAR_BRIGHTNESS_NAMES[brightness]}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                className="mt-2"
                onClick={() => void handleCraft()}
                disabled={state.shards < craftCost || busy !== null}
              >
                {busy === "craft" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                凝星（{craftCost} 星辉）
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <PackageOpen className="h-3.5 w-3.5" /> 每日共鸣
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              已点亮 {completedKeys.length} / {props.constellations.length} 座星座，每座每天{" "}
              {formatCredits(props.resonanceReward)} tcr
            </p>
            {state.resonanceDay === props.today ? (
              <p className="mt-2 text-xs text-success">今天已经共鸣过了</p>
            ) : (
              <Button
                type="button"
                size="sm"
                className="mt-2"
                onClick={() => void handleResonance()}
                disabled={!resonanceReady || busy !== null}
              >
                {busy === "resonance" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                共鸣领取 {formatCredits(resonanceValue)} tcr
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Gift className="h-3.5 w-3.5" /> 星座奖励
          </p>
          {claimable.length > 0 ? (
            <Button type="button" size="sm" onClick={() => void handleClaim()} disabled={busy !== null}>
              {busy === "claim" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              补领 {claimable.length} 座
            </Button>
          ) : null}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {props.constellations.map((item) => {
            const reward = rewardFor(item.key);
            const count = item.nodes.filter((node) => lit.has(node.id)).length;
            const complete = count === item.nodes.length;
            const done = granted.includes(item.key);
            return (
              <div
                key={item.key}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm",
                  done ? "border-success/30 bg-success/5" : "border-border bg-card",
                )}
              >
                <p className="flex items-center justify-between gap-2">
                  <span>{item.name}</span>
                  <span className={done ? "text-success" : "text-muted-foreground"}>
                    {done ? "已领取" : `${formatCredits(reward)} tcr`}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {done
                    ? "已完成并发放"
                    : complete
                      ? "已完成，可补领"
                      : `进度 ${count}/${item.nodes.length}`}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
