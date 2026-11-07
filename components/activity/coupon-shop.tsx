"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gem, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatCredits } from "@/lib/billing/credits";
import type { ActivityCouponView } from "@/lib/activity/coupons";
import { buyCouponPackAction, exchangeCouponAction } from "@/app/(dashboard)/cashback/coupon-actions";
import { cn } from "@/lib/utils";

const STATUS_TEXT: Record<ActivityCouponView["status"], string> = {
  active: "进行中",
  pending: "未开始",
  disabled: "未开启",
  ended: "已结束",
};

const PACK_RATIO_LABEL: Record<string, string> = {
  small: "200%",
  medium: "500%",
  large: "1000%",
};

/**
 * 活动券的兑换与珍宝礼包：活动页与钱包充值位共用。
 * 券只在当期活动内有效，兑换与买礼包都按「先临时余额、再永久余额」扣款。
 */
export function CouponShop({
  activities,
  tone = "default",
}: {
  activities: ActivityCouponView[];
  tone?: "default" | "dark";
}) {
  return (
    <div className={cn("grid gap-4", activities.length > 1 && "md:grid-cols-3")}>
      {activities.map((activity) => (
        <CouponShopItem key={activity.kind} activity={activity} tone={tone} />
      ))}
    </div>
  );
}

function CouponShopItem({
  activity,
  tone,
}: {
  activity: ActivityCouponView;
  tone: "default" | "dark";
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const active = activity.status === "active";
  const dark = tone === "dark";

  async function handleExchange() {
    if (busy) return;
    setBusy("exchange");
    const res = await exchangeCouponAction({ kind: activity.kind, amount });
    setBusy(null);
    if (!res.success) {
      toast.error(res.message);
      return;
    }
    toast.success(res.message);
    setAmount("");
    router.refresh();
  }

  async function handlePack(packKey: string) {
    if (busy) return;
    setBusy(packKey);
    const res = await buyCouponPackAction({ kind: activity.kind, pack: packKey });
    setBusy(null);
    if (!res.success) {
      toast.error(res.message);
      return;
    }
    toast.success(res.message);
    router.refresh();
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        dark ? "border-white/10 bg-white/[0.03]" : "border-border bg-secondary/30",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("flex items-center gap-1.5 text-sm font-medium", dark && "text-white")}>
            <Gem className={cn("h-3.5 w-3.5", dark ? "text-cyan-300" : "text-primary")} />
            {activity.couponName}
          </p>
          <p className={cn("mt-0.5 text-xs", dark ? "text-white/45" : "text-muted-foreground")}>
            {activity.label} · {STATUS_TEXT[activity.status]}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 text-sm font-semibold tabular-nums",
            dark ? "text-amber-200" : "text-foreground",
          )}
        >
          {formatCredits(activity.credits)} cr
        </span>
      </div>

      {active ? (
        <>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              step="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={busy !== null}
              placeholder="兑换数量"
              className={cn(
                "min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-sm tabular-nums outline-none",
                dark
                  ? "border-white/15 bg-black/30 text-white placeholder:text-white/30"
                  : "border-border bg-card",
              )}
            />
            <Button
              type="button"
              size="sm"
              onClick={() => void handleExchange()}
              disabled={busy !== null || !amount.trim()}
            >
              {busy === "exchange" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              兑换
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {activity.packs.map((pack) => (
              <button
                key={pack.key}
                type="button"
                onClick={() => void handlePack(pack.key)}
                disabled={busy !== null}
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-left transition-colors disabled:opacity-50",
                  dark
                    ? "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"
                    : "border-border bg-card hover:bg-secondary",
                )}
              >
                <span
                  className={cn(
                    "block text-[11px] font-medium",
                    dark ? "text-white/80" : "text-foreground",
                  )}
                >
                  {pack.name}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block text-[10px] tabular-nums",
                    dark ? "text-white/45" : "text-muted-foreground",
                  )}
                >
                  {formatCredits(pack.priceCredits)} cr
                  <span className="ml-1 text-success">{PACK_RATIO_LABEL[pack.key]}</span>
                </span>
                <span
                  className={cn(
                    "mt-0.5 block text-[10px] tabular-nums",
                    dark ? "text-cyan-300/80" : "text-primary",
                  )}
                >
                  得 {formatCredits(pack.priceCredits * pack.ratio)} cr
                </span>
              </button>
            ))}
          </div>
          <p className={cn("text-[11px]", dark ? "text-white/35" : "text-muted-foreground")}>
            券按 1:1 抵玩法费用，当期结束后作废；扣款先临时余额、再永久余额。
          </p>
        </>
      ) : (
        <p className={cn("text-xs", dark ? "text-white/40" : "text-muted-foreground")}>
          活动{STATUS_TEXT[activity.status]}，当期券不可兑换或使用。
        </p>
      )}
    </div>
  );
}
