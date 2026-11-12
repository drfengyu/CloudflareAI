"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gift, Library, Loader2, PackageOpen, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CouponCount } from "@/components/activity/coupon-badge";
import { formatCredits } from "@/lib/billing/credits";
import { cn } from "@/lib/utils";
import {
  claimCollectionMilestonesAction,
  openCollectionBoxAction,
  redeemCollectionAction,
} from "@/app/(dashboard)/collection/actions";
import type { OpenBoxResult } from "@/lib/collection/store";

interface AlbumItem {
  key: string;
  name: string;
  weight: number;
}

interface AlbumSet {
  key: string;
  name: string;
  subtitle: string;
  items: AlbumItem[];
}

interface AlbumState {
  day: string;
  boxesToday: number;
  dust: number;
  owned: string[];
}

interface AlbumProps {
  initial: AlbumState;
  sets: AlbumSet[];
  dailyBoxes: number;
  priceTickets: number;
  couponTickets: number;
  dustPerItem: number;
  duplicateDust: number;
  setRewards: { set: string; reward: number }[];
  grantedSets: string[];
}

const itemKey = (setKey: string, key: string) => `${setKey}/${key}`;

export function CollectionAlbum(props: AlbumProps) {
  const router = useRouter();
  const [state, setState] = useState<AlbumState>(props.initial);
  const [activeSet, setActiveSet] = useState(props.sets[0]?.key ?? "");
  const [granted, setGranted] = useState<string[]>(props.grantedSets);
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<OpenBoxResult | null>(null);

  const owned = new Set(state.owned);
  const set = props.sets.find((item) => item.key === activeSet) ?? props.sets[0];
  const rewardFor = (key: string) => props.setRewards.find((item) => item.set === key)?.reward ?? 0;
  const completeSets = props.sets.filter((item) =>
    item.items.every((entry) => owned.has(itemKey(item.key, entry.key))),
  );
  const claimable = completeSets.filter(
    (item) => rewardFor(item.key) > 0 && !granted.includes(item.key),
  );
  const canOpen =
    state.boxesToday < props.dailyBoxes && props.couponTickets >= props.priceTickets;

  async function handleOpen() {
    if (busy) return;
    setBusy("open");
    const res = await openCollectionBoxAction();
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    setState(res.data.state);
    setLast(res.data);
    setGranted((prev) => [...new Set([...prev, ...res.data.completedSets])]);
    setActiveSet(res.data.setKey);
    toast.success(
      res.data.isNew
        ? `收录「${res.data.itemName}」`
        : `重复的「${res.data.itemName}」，折算 ${res.data.dustGained} 星尘`,
    );
    if (res.data.milestoneReward > 0) {
      toast.success(`集齐星匣，获得 ${formatCredits(res.data.milestoneReward)} tcr`);
    }
    router.refresh();
  }

  async function handleRedeem(setId: string, itemName: string, key: string) {
    if (busy) return;
    setBusy(`redeem-${key}`);
    const res = await redeemCollectionAction({ setId, itemKey: key });
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    setState(res.data.state);
    setGranted((prev) => [...new Set([...prev, ...res.data.completedSets])]);
    toast.success(`用 ${props.dustPerItem} 星尘兑换「${itemName}」`);
    if (res.data.milestoneReward > 0) {
      toast.success(`集齐星匣，获得 ${formatCredits(res.data.milestoneReward)} tcr`);
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
      toast.message("没有可补领的集齐奖励");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {props.sets.map((item) => {
          const got = item.items.filter((entry) => owned.has(itemKey(item.key, entry.key))).length;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveSet(item.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                item.key === set?.key
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              <Library className="h-3.5 w-3.5" />
              {item.name}
              <span className="text-xs tabular-nums">
                {got}/{item.items.length}
              </span>
            </button>
          );
        })}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          星尘 {state.dust} · 今日已开 {state.boxesToday} / {props.dailyBoxes}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
        <Button type="button" onClick={() => void handleOpen()} disabled={!canOpen || busy !== null}>
          {busy === "open" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PackageOpen className="h-4 w-4" />
          )}
          开启星匣
        </Button>
        <span className="text-sm text-muted-foreground">
          花 <CouponCount kind="collection" count={props.priceTickets} /> 开一次，重复藏品折算{" "}
          {props.duplicateDust} 星尘；可用 {props.couponTickets} 张
        </span>
        {!canOpen ? (
          <span className="text-xs text-destructive">
            {state.boxesToday >= props.dailyBoxes ? "今日开匣次数已用完" : "星匣券不足，请先兑换"}
          </span>
        ) : null}
      </div>

      {last ? (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
          <Sparkles className="h-4 w-4 shrink-0 text-[color:var(--primary)]" />
          <p className="text-sm">
            刚开出 <span className="font-medium">{last.setName}</span> ·{" "}
            <span className="font-medium">{last.itemName}</span>
            <span className={cn("ml-2 text-xs", last.isNew ? "text-success" : "text-muted-foreground")}>
              {last.isNew ? "首次收录" : `重复，+${last.dustGained} 星尘`}
            </span>
          </p>
        </div>
      ) : null}

      {set ? (
        <div>
          <p className="mb-2 text-sm text-muted-foreground">{set.subtitle}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {set.items.map((entry) => {
              const key = itemKey(set.key, entry.key);
              const has = owned.has(key);
              const canRedeem = !has && state.dust >= props.dustPerItem;
              return (
                <div
                  key={entry.key}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-center",
                    has ? "border-primary/30 bg-primary/5" : "border-dashed border-border bg-card",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border",
                      has
                        ? "border-[color:var(--primary)]/40 bg-primary/10 text-[color:var(--primary)]"
                        : "border-border text-muted-foreground/50",
                    )}
                  >
                    <Library className="h-4 w-4" />
                  </span>
                  <span className={cn("text-xs", has ? "font-medium" : "text-muted-foreground")}>
                    {entry.name}
                  </span>
                  {has ? (
                    <span className="text-[10px] text-success">已收录</span>
                  ) : canRedeem ? (
                    <button
                      type="button"
                      onClick={() => void handleRedeem(set.key, entry.name, entry.key)}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-1.5 py-0.5 text-[10px] text-[color:var(--primary)] transition-colors hover:bg-primary/10 disabled:opacity-50"
                    >
                      {busy === `redeem-${entry.key}` ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : null}
                      {props.dustPerItem} 星尘
                    </button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      {props.dustPerItem} 星尘
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Gift className="h-3.5 w-3.5" /> 集齐奖励
          </p>
          {claimable.length > 0 ? (
            <Button type="button" size="sm" onClick={() => void handleClaim()} disabled={busy !== null}>
              {busy === "claim" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              补领 {claimable.length} 个
            </Button>
          ) : null}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {props.sets.map((item) => {
            const reward = rewardFor(item.key);
            const complete = completeSets.some((entry) => entry.key === item.key);
            const done = granted.includes(item.key);
            const got = item.items.filter((entry) => owned.has(itemKey(item.key, entry.key))).length;
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
                    ? "已集齐并发放"
                    : complete
                      ? "已集齐，可补领"
                      : `进度 ${got}/${item.items.length}`}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
