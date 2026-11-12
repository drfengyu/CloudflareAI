"use client";

import { Crosshair, Layers, Library, PawPrint, Sparkles, Swords, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type CouponKind = "lottery" | "flip" | "raiden" | "trial" | "workshop" | "collection";

const KIND_STYLE: Record<CouponKind, { Icon: LucideIcon; color: string }> = {
  lottery: { Icon: Sparkles, color: "text-fuchsia-500" },
  flip: { Icon: Layers, color: "text-emerald-500" },
  raiden: { Icon: Crosshair, color: "text-amber-500" },
  trial: { Icon: Swords, color: "text-sky-500" },
  workshop: { Icon: PawPrint, color: "text-orange-500" },
  collection: { Icon: Library, color: "text-violet-500" },
};

/** 对应活动的券图标：三种玩法各用一种颜色与记号。 */
export function CouponIcon({ kind, className }: { kind: CouponKind; className?: string }) {
  const { Icon, color } = KIND_STYLE[kind];
  return <Icon aria-hidden className={cn("inline-block shrink-0", color, className ?? "h-3.5 w-3.5")} />;
}

/** 券数量统一写成「图标 × 张数」，替代任何 cr 券面文案。 */
export function CouponCount({
  kind,
  count,
  className,
  iconClassName,
}: {
  kind: CouponKind;
  count: number;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 whitespace-nowrap tabular-nums", className)}>
      <CouponIcon kind={kind} className={iconClassName} />
      <span>×{Math.max(0, Math.round(count))}</span>
    </span>
  );
}
