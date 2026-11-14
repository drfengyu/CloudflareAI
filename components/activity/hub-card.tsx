import Link from "next/link";
import { AlertTriangle, ArrowRight, Library, PawPrint, Swords, Ticket, type LucideIcon } from "lucide-react";
import { formatCnWallClock } from "@/lib/date";
import { formatCredits } from "@/lib/billing/credits";
import { cn } from "@/lib/utils";
import type { ActivityKind } from "@/lib/activity/coupons";
import type { HubActivity, HubProgress } from "@/lib/activity/hub";
import type { ActivityPhase } from "@/lib/activity/window";
import { CouponIcon } from "./coupon-badge";
import { Countdown } from "./countdown";

/**
 * 活动中心的一张三合一卡片：状态、倒计时、券余额、本期进度与「接着玩」入口。
 * 只展示聚合器算好的结果，不在这里读配置或存档。
 */

const ACTIVITY_ICON: Record<ActivityKind, LucideIcon> = {
  trial: Swords,
  workshop: PawPrint,
  collection: Library,
  lottery: Ticket,
  flip: Ticket,
  raiden: Ticket,
};

const STATUS_STYLE: Record<ActivityPhase, string> = {
  active: "border-success/40 bg-success/10 text-success",
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  ended: "border-border bg-secondary/60 text-muted-foreground",
  disabled: "border-border bg-secondary/60 text-muted-foreground",
};

function ProgressRow({ row }: { row: HubProgress }) {
  const pct =
    row.max !== null && row.max > 0
      ? Math.min(100, Math.round((row.value / row.max) * 100))
      : null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">{row.label}</span>
        <span className="tabular-nums text-foreground">
          {row.value}
          {row.max !== null ? ` / ${row.max}` : ""}
          {row.hint ? <span className="ml-1 text-muted-foreground">{row.hint}</span> : null}
        </span>
      </div>
      {pct !== null ? (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export function HubCard({ card }: { card: HubActivity }) {
  const Icon = ACTIVITY_ICON[card.kind];
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Icon className="h-4 w-4 shrink-0 text-[color:var(--primary)]" />
            <span className="truncate">{card.label}</span>
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {card.couponName} · 1 张 = {formatCredits(card.unitCredits)} cr
            {card.status === "active" && card.endMs
              ? ` · ${formatCnWallClock(card.endMs, false)} 结束`
              : ""}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] leading-relaxed",
            STATUS_STYLE[card.status],
          )}
        >
          {card.statusText}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {card.countdown && card.endMs ? (
          <Countdown
            endMs={card.endMs}
            initialText={card.countdown.text}
            initialTone={card.countdown.tone}
          />
        ) : null}
        <span className="ml-auto inline-flex items-center gap-1 text-sm font-semibold tabular-nums">
          <CouponIcon kind={card.kind} className="h-4 w-4" />×{card.tickets}
        </span>
      </div>

      {card.progress.length > 0 ? (
        <div className="mt-3 space-y-2">
          {card.progress.map((row) => (
            <ProgressRow key={row.label} row={row} />
          ))}
        </div>
      ) : null}

      {card.alerts.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {card.alerts.map((alert) => (
            <li
              key={alert}
              className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{alert}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <span className="text-[11px] text-muted-foreground">兑换与礼包在玩法页</span>
        <Link
          href={card.href}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {card.cta}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
