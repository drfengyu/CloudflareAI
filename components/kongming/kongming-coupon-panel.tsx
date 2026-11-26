"use client";

import { useState } from "react";
import { Gem, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CouponShop } from "@/components/activity/coupon-shop";
import { CouponIcon } from "@/components/activity/coupon-badge";
import { formatCredits } from "@/lib/billing/credits";
import type { ActivityCouponView } from "@/lib/activity/coupons";
import type { KongmingCouponGoldOffer } from "@/lib/kongming/activity-config";
import { redeemKongmingGoldAction } from "@/app/kongming/actions";

/** 活动页内的孔明券兑换：买券沿用通用 CouponShop，军资兑换只在本活动出现。 */
export function KongmingCouponPanel({
  activity,
  couponGoldOffers,
  onGold,
}: {
  activity: ActivityCouponView;
  couponGoldOffers: KongmingCouponGoldOffer[];
  onGold: (gold: number) => void;
}) {
  const router = useRouter();
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const active = activity.status === "active";

  async function redeem(index: number) {
    if (busyIndex !== null || !active) return;
    setBusyIndex(index);
    const res = await redeemKongmingGoldAction({ offerIndex: index });
    setBusyIndex(null);
    if (!res.success || !res.gold) {
      toast.error(res.message);
      return;
    }
    onGold(res.gold);
    toast.success(res.message);
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
          1 张 = {formatCredits(activity.unitCredits)} cr
        </p>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">购买当期活动券</p>
          <CouponShop activities={[activity]} />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">活动券换游戏军资（金）</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {couponGoldOffers.map((offer, index) => (
              <button
                key={`${offer.tickets}-${offer.gold}-${index}`}
                type="button"
                onClick={() => void redeem(index)}
                disabled={busyIndex !== null || !active || activity.tickets < offer.tickets}
                className="rounded-lg border border-border bg-secondary/40 px-2 py-2 text-left text-xs tabular-nums text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-40"
              >
                {busyIndex === index ? (
                  <Loader2 className="mb-1 h-3.5 w-3.5 animate-spin" />
                ) : null}
                <span className="block text-foreground">{offer.tickets} 张券</span>
                <span className="block text-primary">{offer.gold} 金</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            三档商品与兑换比例由「系统设置 → 限时活动（诸葛孔明传）」控制；券只在当期有效。
            未开局时兑换的金先存在浏览器，下一次「初出茅庐 / 匡扶汉室」时并入存档。
          </p>
        </div>
      </div>
    </div>
  );
}
