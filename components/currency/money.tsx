import { Coins, Hourglass } from "lucide-react";
import { formatAmount } from "@/lib/billing/units";
import { cn } from "@/lib/utils";

export type MoneyUnit = "cr" | "tcr";

const UNIT_STYLE = {
  cr: { Icon: Coins, color: "text-emerald-500" },
  tcr: { Icon: Hourglass, color: "text-teal-500" },
} as const;

/**
 * 带图标的金额：cr 金币、tcr 沙漏。
 * 界面只用单位区分两种余额，不再写「永久货币 / 临时货币」。
 */
export function Money({
  value,
  unit = "cr",
  signed = false,
  className,
  iconClassName,
  hideIcon = false,
}: {
  value: number;
  unit?: MoneyUnit;
  /** 正数前加 `+`，用于中奖 / 入账。 */
  signed?: boolean;
  className?: string;
  iconClassName?: string;
  hideIcon?: boolean;
}) {
  const { Icon, color } = UNIT_STYLE[unit];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap tabular-nums", className)}>
      {hideIcon ? null : <Icon aria-hidden className={cn("h-3.5 w-3.5 shrink-0", color, iconClassName)} />}
      <span>
        {signed && value > 0 ? "+" : ""}
        {formatAmount(value)} {unit}
      </span>
    </span>
  );
}

/** 两种单位的图例：钱包等需要解释余额构成的地方用。 */
export function UnitLegend({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      <span className="inline-flex items-center gap-1">
        <Coins aria-hidden className="h-3.5 w-3.5 text-emerald-500" />
        cr：充值到账，不过期
      </span>
      <span className="inline-flex items-center gap-1">
        <Hourglass aria-hidden className="h-3.5 w-3.5 text-teal-500" />
        tcr：签到、赠送与返利，到期作废
      </span>
    </span>
  );
}
