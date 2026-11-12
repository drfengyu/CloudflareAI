"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, PawPrint, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CouponCount } from "@/components/activity/coupon-badge";
import { formatCredits } from "@/lib/billing/credits";
import { cn } from "@/lib/utils";
import {
  gatherWorkshopAction,
  mergeWorkshopAction,
  claimWorkshopMilestonesAction,
} from "@/app/(dashboard)/workshop/actions";

interface BoardLine {
  key: string;
  name: string;
  tiers: string[];
}

interface BoardState {
  gathersToday: number;
  items: Record<string, number[]>;
}

interface BoardProps {
  initial: BoardState;
  version: number;
  lines: BoardLine[];
  dailyGathers: number;
  gathersToday: number;
  priceTickets: number;
  couponTickets: number;
  milestones: { tier: number; reward: number }[];
  grantedTiers: number[];
}

function reachedTier(items: Record<string, number[]>): number {
  let max = 0;
  for (const counts of Object.values(items)) {
    counts.forEach((count, index) => {
      if (count > 0) max = Math.max(max, index + 1);
    });
  }
  return max;
}

export function WorkshopBoard(props: BoardProps) {
  const router = useRouter();
  const [lineKey, setLineKey] = useState(props.lines[0]?.key ?? "");
  const [state, setState] = useState<BoardState>(props.initial);
  const [granted, setGranted] = useState<number[]>(props.grantedTiers);
  const [busy, setBusy] = useState<string | null>(null);

  const line = props.lines.find((item) => item.key === lineKey) ?? props.lines[0];
  const counts = line ? (state.items[line.key] ?? []) : [];
  const gathersToday = state.gathersToday;
  const canGather =
    gathersToday < props.dailyGathers && props.couponTickets >= props.priceTickets;
  const reached = reachedTier(state.items);
  const claimable = props.milestones.filter(
    (item) => item.tier <= reached && item.reward > 0 && !granted.includes(item.tier),
  );
  const totalPets = Object.values(state.items).reduce(
    (sum, list) => sum + list.reduce((inner, count) => inner + count, 0),
    0,
  );

  async function handleGather() {
    if (!line || busy) return;
    setBusy("gather");
    const res = await gatherWorkshopAction(line.key);
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    setState(res.data.state);
    setGranted((prev) => [...new Set([...prev, ...res.data.milestoneTiers])]);
    toast.success(`采到 ${res.data.gathered?.name ?? "一只灵宠"}`);
    if (res.data.milestoneReward > 0) {
      toast.success(`达成 ${res.data.milestoneTiers.join(" / ")} 阶，获得 ${formatCredits(res.data.milestoneReward)} tcr`);
    }
    router.refresh();
  }

  async function handleMerge(tier: number) {
    if (busy) return;
    setBusy(`merge-${tier}`);
    const res = await mergeWorkshopAction({ lineKey: line.key, tier });
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    setState(res.data.state);
    setGranted((prev) => [...new Set([...prev, ...res.data.milestoneTiers])]);
    toast.success(`合成出 ${line.tiers[tier] ?? `第 ${tier + 1} 阶`}`);
    if (res.data.milestoneReward > 0) {
      toast.success(`达成 ${res.data.milestoneTiers.join(" / ")} 阶，获得 ${formatCredits(res.data.milestoneReward)} tcr`);
    }
    router.refresh();
  }

  async function handleClaim() {
    if (busy) return;
    setBusy("claim");
    const res = await claimWorkshopMilestonesAction();
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    if (res.data.reward > 0) {
      toast.success(`补领 ${formatCredits(res.data.reward)} tcr`);
      setGranted((prev) => [...new Set([...prev, ...res.data.tiers])]);
      router.refresh();
    } else {
      toast.message("没有可补领的里程碑");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {props.lines.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setLineKey(item.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
              item.key === line?.key
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            <PawPrint className="h-3.5 w-3.5" />
            {item.name}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          今日已采集 {gathersToday} / {props.dailyGathers} · 共 {totalPets} 只灵宠
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
        <Button type="button" onClick={() => void handleGather()} disabled={!canGather || busy !== null}>
          {busy === "gather" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          采集一次
        </Button>
        <span className="text-sm text-muted-foreground">
          花 <CouponCount kind="workshop" count={props.priceTickets} /> 采到 1~3 阶灵宠；
          可用 {props.couponTickets} 张
        </span>
        {!canGather ? (
          <span className="text-xs text-destructive">
            {gathersToday >= props.dailyGathers ? "今日采集次数已用完" : "工坊券不足，请先兑换"}
          </span>
        ) : null}
      </div>

      {line ? (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-3">
          {line.tiers.map((name, index) => {
            const tier = index + 1;
            const count = counts[index] ?? 0;
            const canMerge = tier < line.tiers.length && count >= 2;
            return (
              <div
                key={name}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border p-3",
                  count > 0 ? "border-primary/30 bg-primary/5" : "border-border bg-card",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{tier} 阶</span>
                  <span className="text-sm font-semibold tabular-nums">×{count}</span>
                </div>
                <p className={cn("text-sm", count > 0 ? "font-medium" : "text-muted-foreground")}>{name}</p>
                {canMerge ? (
                  <button
                    type="button"
                    onClick={() => void handleMerge(tier)}
                    disabled={busy !== null}
                    className="mt-auto inline-flex items-center gap-1 self-start rounded-md border border-primary/40 px-2 py-1 text-xs text-[color:var(--primary)] transition-colors hover:bg-primary/10 disabled:opacity-50"
                  >
                    {busy === `merge-${tier}` ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ArrowRight className="h-3 w-3" />
                    )}
                    两只合成 {line.tiers[index + 1]}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">里程碑</p>
          {claimable.length > 0 ? (
            <Button type="button" size="sm" onClick={() => void handleClaim()} disabled={busy !== null}>
              {busy === "claim" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              补领 {claimable.length} 档
            </Button>
          ) : null}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {props.milestones.map((item) => {
            const done = granted.includes(item.tier);
            const reachedThis = reached >= item.tier;
            return (
              <div
                key={item.tier}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm",
                  done ? "border-success/30 bg-success/5" : "border-border bg-card",
                )}
              >
                <p className="flex items-center justify-between gap-2">
                  <span>{item.tier} 阶</span>
                  <span className={done ? "text-success" : "text-muted-foreground"}>
                    {done ? "已领取" : `${formatCredits(item.reward)} tcr`}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {done ? "任意一条线达到即已发放" : reachedThis ? "已达成，可补领" : "任意一条线达到该阶"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
