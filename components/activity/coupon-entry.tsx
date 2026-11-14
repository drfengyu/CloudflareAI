"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ActivityCouponView } from "@/lib/activity/coupons";
import { CouponIcon } from "./coupon-badge";
import { CouponShop } from "./coupon-shop";

/**
 * 玩法画面内的券包入口：活动券按内置货币处理，余额与兑换 / 礼包都留在游戏画面里，
 * 玩法页本身不再挂独立的券商店。
 */
export function CouponEntry({
  activity,
  tone = "default",
  label = "兑换 / 礼包",
  className,
}: {
  activity: ActivityCouponView;
  tone?: "default" | "dark";
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const dark = tone === "dark";

  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors",
          dark
            ? "border-white/15 bg-white/5 text-white/75 hover:border-cyan-300/40 hover:text-white"
            : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
        )}
      >
        <CouponIcon kind={activity.kind} className="h-3.5 w-3.5" />
        <span className="tabular-nums">{activity.tickets} 张</span>
        <span className={dark ? "text-cyan-200/80" : "text-primary"}>
          {open ? "收起" : label}
        </span>
      </button>
      {open ? <CouponShop activities={[activity]} tone={tone} /> : null}
    </div>
  );
}
