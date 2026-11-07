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

/** 顶栏只求一眼看懂：万位以上压成 k/m，完整数值放在 title 里。 */
function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}m`;
  }
  if (abs >= 10_000) {
    return `${(value / 1_000).toFixed(abs >= 100_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }
  if (abs >= 1) return value.toFixed(abs >= 100 ? 0 : 2).replace(/\.?0+$/, "");
  if (abs === 0) return "0";
  return value.toFixed(2);
}

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
      title={`${coupon.couponName}（${coupon.label}）余额 ${exact(coupon.credits)} cr${
        active ? "，点击兑换或查看礼包" : "，活动未开启"
      }`}
      className={`flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium tabular-nums transition-colors hover:bg-secondary ${
        active ? "text-foreground" : "text-muted-foreground/60"
      }`}
    >
      <Icon className={`h-3.5 w-3.5 shrink-0 ${KIND_COLOR[coupon.kind]}`} />
      <span>{compact(coupon.credits)}</span>
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
        className="flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium tabular-nums text-foreground transition-colors hover:bg-secondary"
      >
        <Coins className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        <span>{compact(display.permanent)}</span>
        <PlusBadge />
      </Link>
      <div
        title={`临时余额 ${exact(display.temporary)} cr，签到、赠送与返利获得，到期作废`}
        className="flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground"
      >
        <Hourglass className="h-3.5 w-3.5 shrink-0 text-teal-500" />
        <span>{compact(display.temporary)}</span>
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
          className="flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium tabular-nums text-foreground transition-colors hover:bg-secondary md:hidden"
        >
          <Ticket className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{compact(couponTotal)}</span>
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
                    {exact(coupon.credits)}
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
