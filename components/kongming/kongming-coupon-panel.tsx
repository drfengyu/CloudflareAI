"use client";

import { useState } from "react";
import { Coins, Gem, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CouponShop } from "@/components/activity/coupon-shop";
import { CouponIcon } from "@/components/activity/coupon-badge";
import { Button } from "@/components/ui/button";
import { formatCredits } from "@/lib/billing/credits";
import type { ActivityCouponView } from "@/lib/activity/coupons";
import { redeemKongmingGoldAction } from "@/app/kongming/actions";
import { cn } from "@/lib/utils";

/** 活动页内的孔明券兑换：买券沿用通用 CouponShop，军资兑换只在本活动出现。 */
export function KongmingCouponPanel({
  activity,
  goldPerCoupon,
  maxCouponsPerExchange,
  onGold,
}: {
  activity: ActivityCouponView;
  goldPerCoupon: number;
  maxCouponsPerExchange: number;
  onGold: (gold: number) => void;
}) {
  const router = useRouter();
  const [tickets, setTickets] = useState("1");
  const [busy, setBusy] = useState(false);
  const active = activity.status === "active";
  const count = Math.trunc(Number(tickets));
  const costTickets =
    Number.isFinite(count) && count > 0 ? Math.min(count, maxCouponsPerExchange) : 0;
  const gold = costTickets * goldPerCoupon;

  async function redeem() {
    if (busy || !active) return;
    setBusy(true);
    const res = await redeemKongmingGoldAction({ tickets: count });
    setBusy(false);
    if (!res.success || !res.gold) {
      toast.error(res.message);
      return;
    }
    onGold(res.gold);
    toast.success(res.message);
    setTickets("1");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border/70 bg-card/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Gem className="h-4 w-4 text-primary" />
          活动券 · {activity.couponName}
        </p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          余额 <CouponIcon kind="kongming" className="h-3.5 w-3.5" />×{activity.tickets}
          <span className="mx-1 text-border">|</span>
          1 张 = {formatCredits(activity.unitCredits)} cr = {goldPerCoupon} 金
        </p>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">购买当期活动券</p>
          <CouponShop activities={[activity]} />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">兑换游戏内军资（金）</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={maxCouponsPerExchange}
              step="1"
              value={tickets}
              onChange={(event) => setTickets(event.target.value)}
              disabled={busy || !active}
              placeholder="兑换张数"
              aria-label="兑换军资的孔明券张数"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm tabular-nums outline-none"
            />
            <Button
              type="button"
              size="sm"
              onClick={() => void redeem()}
              disabled={busy || !active || costTickets <= 0}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              兑换军资
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[1, 10, 50, maxCouponsPerExchange].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTickets(String(value))}
                disabled={!active}
                className="rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground hover:text-foreground"
              >
                {value === maxCouponsPerExchange ? `上限 ${value}` : `${value} 张`}
              </button>
            ))}
          </div>
          <p className={cn("text-[11px] tabular-nums", gold > 0 ? "text-primary" : "text-muted-foreground")}>
            {costTickets > 0
              ? `${costTickets} 张 → ${gold} 金（扣券 ${costTickets} 张）`
              : "输入 1 张以上"}
            <span className="ml-2 text-muted-foreground">兑换后请在游戏里保存存档</span>
          </p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            活动券只在当期有效；兑换比例与单次上限由「系统设置 → 限时活动（诸葛孔明传）」控制。
            未开局时兑换的金先存在浏览器，下一次「初出茅庐 / 匡扶汉室」时并入存档。
          </p>
        </div>
      </div>
    </div>
  );
}
