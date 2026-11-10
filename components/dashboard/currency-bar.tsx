"use client";

import Link from "next/link";
import {
  Coins,
  Crosshair,
  Hourglass,
  Layers,
  Plus,
  Sparkles,
  Ticket,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActivityCouponView, CurrencySnapshot } from "@/lib/activity/coupons";
import { formatCredits } from "@/lib/billing/credits";

/**
 * 顶栏货币条：永久余额、临时余额与三种活动券。
 *
 * 铃铛左边的数字由布局一次取齐；这里只做展示与跳转，不自己发请求。
 * 永久/临时仍按负数补正口径显示（与钱包、看板一致）。
 */

const KIND_ICON = {
  lottery: Sparkles,
  flip: Layers,
  raiden: Crosshair,
} as const;

const KIND_COLOR = {
  lottery: "text-violet-500",
  flip: "text-amber-500",
  raiden: "text-sky-500",
} as const;

function exact(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function compensate(permanent: number, temporary: number) {
  if (permanent >= 0) return { permanent, temporary };
  const deficit = Math.abs(permanent);
  return temporary >= deficit
    ? { permanent: 0, temporary: temporary - deficit }
    : { permanent: permanent + temporary, temporary: 0 };
}

function PlusBadge() {
  return (
    <span className="flex h-3 w-3 items-center justify-center rounded-full bg-primary/15 text-primary">
      <Plus className="h-2 w-2" />
    </span>
  );
}

function CouponChip({ coupon }: { coupon: ActivityCouponView }) {
  const Icon = KIND_ICON[coupon.kind];
  const active = coupon.status === "active";
  return (
    <Link
      href={coupon.href}
      title={`${coupon.couponName}（${coupon.label}）余额 ${exact(coupon.credits)} cr 券面，1 张 = ${exact(
        coupon.unitCredits,
      )} cr${active ? "，点击兑换或查看礼包" : "，活动未开启"}`}
      className={`flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium tabular-nums transition-colors hover:bg-secondary ${
        active ? "text-foreground" : "text-muted-foreground/60"
      }`}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${KIND_COLOR[coupon.kind]}`} />
      <span>
        {formatCredits(coupon.credits)} cr
      </span>
      {active ? <PlusBadge /> : null}
    </Link>
  );
}

export function CurrencyBar({ snapshot }: { snapshot: CurrencySnapshot }) {
  const display = compensate(snapshot.permanent, snapshot.temporary);
  const couponTotal = snapshot.coupons.reduce((sum, coupon) => sum + coupon.credits, 0);

  return (
    <div className="flex items-center gap-0.5">
      <Link
        href="/wallet?recharge=1"
        title={`永久余额 ${exact(display.permanent)} cr，点击充值`}
        className="flex items-center gap-0.5 whitespace-nowrap rounded-md px-0.5 py-0.5 text-[10px] font-medium tabular-nums text-foreground transition-colors hover:bg-secondary md:gap-1 md:px-1 md:text-[11px]"
      >
        <Coins className="h-3 w-3 shrink-0 text-emerald-500 md:h-3.5 md:w-3.5" />
        <span>{formatCredits(display.permanent)} cr</span>
        <PlusBadge />
      </Link>
      <div
        title={`临时余额 ${exact(display.temporary)} tcr，签到、赠送与返利获得，到期作废`}
        className="flex items-center gap-0.5 whitespace-nowrap rounded-md px-0.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground md:gap-1 md:px-1 md:text-[11px]"
      >
        <Hourglass className="h-3 w-3 shrink-0 text-teal-500 md:h-3.5 md:w-3.5" />
        <span>{formatCredits(display.temporary)} tcr</span>
      </div>

      <div className="hidden items-center gap-0.5 md:flex">
        {snapshot.coupons.map((coupon) => (
          <CouponChip key={coupon.kind} coupon={coupon} />
        ))}
      </div>

      {/* 窄屏放不下三张券，收进一个下拉；余额合计仍直接显示。 */}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="活动券余额"
          className="flex items-center gap-0.5 whitespace-nowrap rounded-md px-0.5 py-0.5 text-[10px] font-medium tabular-nums text-foreground transition-colors hover:bg-secondary md:hidden md:gap-1 md:px-1 md:text-[11px]"
        >
          <Ticket className="h-3 w-3 shrink-0 text-primary md:h-3.5 md:w-3.5" />
          <span>{formatCredits(couponTotal)} cr</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="normal-case">活动券</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {snapshot.coupons.map((coupon) => {
            const Icon = KIND_ICON[coupon.kind];
            return (
              <DropdownMenuItem key={coupon.kind} asChild>
                <Link href={coupon.href} className="flex w-full items-center gap-2">
                  <Icon className={`h-4 w-4 shrink-0 ${KIND_COLOR[coupon.kind]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{coupon.couponName}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {coupon.label} · {coupon.status === "active" ? "可兑换" : "未开启"}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {exact(coupon.credits)} cr
                  </span>
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
