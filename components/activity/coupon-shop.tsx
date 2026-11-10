"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Crosshair, Gem, Layers, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatCredits } from "@/lib/billing/credits";
import type { ActivityCouponView } from "@/lib/activity/coupons";
import { buyCouponPackAction, exchangeCouponAction } from "@/app/(dashboard)/cashback/coupon-actions";
import { cn } from "@/lib/utils";

const KIND_ICON = {
  lottery: Sparkles,
  flip: Layers,
  raiden: Crosshair,
} as const;

const STATUS_TEXT: Record<ActivityCouponView["status"], string> = {
  active: "进行中",
  pending: "未开始",
  disabled: "未开启",
  ended: "已结束",
};

/**
 * 活动券的兑换与珍宝礼包：活动页与钱包充值位共用。
 * 兑换按活动配置的「1 张 = X cr」整张购买，券只在当期活动内有效；
 * 兑换与买礼包都按「先临时余额、再永久余额」扣款。
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
  const Icon = KIND_ICON[activity.kind];
  const unitCredits = activity.unitCredits > 0 ? activity.unitCredits : 1;
  const couponTickets = Math.round((activity.credits / unitCredits) * 100) / 100;
  const amountNumber = Number(amount);
  const exchangeCost =
    Number.isInteger(amountNumber) && amountNumber > 0
      ? Math.round(amountNumber * unitCredits * 100) / 100
      : 0;

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
        <span className="shrink-0 text-right">
          <span
            className={cn(
              "block text-sm font-semibold tabular-nums",
              dark ? "text-amber-200" : "text-foreground",
            )}
          >
            {formatCredits(activity.credits)} cr
          </span>
          <span className={cn("block text-[10px] tabular-nums", dark ? "text-white/40" : "text-muted-foreground")}>
            ≈ {formatCredits(couponTickets)} 张 · 1 张 = {formatCredits(unitCredits)} cr
          </span>
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
              placeholder="兑换张数"
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
              disabled={busy !== null || exchangeCost <= 0}
            >
              {busy === "exchange" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              兑换
            </Button>
          </div>
          <p className={cn("text-[11px] tabular-nums", dark ? "text-white/40" : "text-muted-foreground")}>
            1 张 = {formatCredits(unitCredits)} cr
            {exchangeCost > 0 ? ` · 本次需 ${formatCredits(exchangeCost)} cr` : " · 输入要兑换的整张数"}
          </p>

          <div className="grid grid-cols-3 gap-2">
            {activity.packs.map((pack) => {
              const soldOut =
                (pack.dailyLimit !== null && pack.boughtToday >= pack.dailyLimit) ||
                (pack.totalLimit !== null && pack.boughtTotal >= pack.totalLimit);
              const limitText =
                pack.dailyLimit === null && pack.totalLimit === null
                  ? "不限购"
                  : [
                      pack.dailyLimit !== null ? `今日 ${pack.boughtToday}/${pack.dailyLimit}` : null,
                      pack.totalLimit !== null ? `累计 ${pack.boughtTotal}/${pack.totalLimit}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
              return (
                <button
                  key={pack.key}
                  type="button"
                  onClick={() => void handlePack(pack.key)}
                  disabled={busy !== null || soldOut}
                  aria-label={`${pack.name} · ${formatCredits(pack.priceCredits)} cr`}
                  title={
                    soldOut
                      ? `${pack.name}已到限购上限`
                      : `${pack.name} · 实付 ${formatCredits(pack.priceCredits)} cr`
                  }
                  className={cn(
                    "group flex flex-col items-center gap-1 rounded-xl border px-1.5 py-2.5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                    dark
                      ? "border-white/10 bg-white/[0.02] hover:border-cyan-300/30 hover:bg-white/[0.06]"
                      : "border-border bg-card hover:border-primary/40 hover:bg-secondary",
                  )}
                >
                  <span
                    className={cn(
                      "whitespace-nowrap text-[15px] font-semibold leading-none tabular-nums",
                      dark ? "text-amber-200" : "text-foreground",
                    )}
                  >
                    {formatCredits(pack.priceCredits)} cr
                  </span>
                  <span className="relative mt-1 inline-flex h-6 w-6 items-center justify-center">
                    <Icon
                      className={cn(
                        "h-5 w-5",
                        dark ? "text-cyan-300" : "text-primary",
                      )}
                    />
                    {pack.bonusTickets > 0 ? (
                      <span
                        className={cn(
                          "absolute -bottom-1 -right-1.5 rounded px-0.5 text-[9px] font-semibold leading-[1.4] tabular-nums",
                          dark
                            ? "bg-cyan-300/20 text-cyan-200"
                            : "bg-primary/15 text-primary",
                        )}
                      >
                        ×{pack.bonusTickets}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] tabular-nums",
                      dark ? "text-white/45" : "text-muted-foreground",
                    )}
                  >
                    {pack.ratioPercent}% → 得{" "}
                    <span className="whitespace-nowrap">
                      {formatCredits(pack.baseCredits)} cr
                    </span>
                  </span>
                  {pack.tempCredits > 0 ? (
                    <span
                      className={cn(
                        "text-[9px] leading-tight tabular-nums",
                        dark ? "text-emerald-300/80" : "text-success",
                      )}
                    >
                      <span className="whitespace-nowrap">
                        +{formatCredits(pack.tempCredits)} tcr
                      </span>{" "}
                      · {pack.tempValidDays} 天
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "text-[9px] tabular-nums",
                      !soldOut && "whitespace-nowrap",
                      soldOut
                        ? dark
                          ? "text-rose-300/80"
                          : "text-destructive"
                        : dark
                          ? "text-white/30"
                          : "text-muted-foreground/80",
                    )}
                  >
                    {soldOut ? `${limitText} · 已满` : limitText}
                  </span>
                </button>
              );
            })}
          </div>
          <p className={cn("text-[11px]", dark ? "text-white/35" : "text-muted-foreground")}>
            1 张 = {formatCredits(unitCredits)} cr；礼包按档位赠送当期活动券，按该单价折成券面一起入账，
            另赠的 tcr 进入临时余额、到期作废；券面按 cr 1:1 抵玩法费用，当期结束后作废；
            扣款先临时余额（tcr）、再永久余额（cr）。
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
