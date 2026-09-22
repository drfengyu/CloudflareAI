import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type StatTone = "primary" | "info" | "success" | "warning" | "danger" | "muted";

const TONE_CLASS: Record<StatTone, string> = {
  primary: "bg-[color:var(--primary)]/12 text-[color:var(--primary)]",
  info: "bg-[color:var(--info)]/15 text-[color:var(--info)]",
  success: "bg-[color:var(--success)]/15 text-[color:var(--success)]",
  warning: "bg-[color:var(--warning)]/15 text-[color:var(--warning)]",
  danger: "bg-[color:var(--destructive)]/15 text-[color:var(--destructive)]",
  muted: "bg-secondary text-muted-foreground",
};

export interface StatItem {
  icon: ReactNode;
  tone: StatTone;
  label: string;
  value: string;
  /** 次要说明，如 ≈ $ 换算或输入/输出明细 */
  sub?: string;
  /** 行尾跳转（如「充值」→ /wallet） */
  href?: string;
  actionLabel?: string;
}

/** 分组统计卡：一个标题带两行指标，对齐 new-api 控制台的卡片密度。 */
export function StatGroupCard({
  icon,
  title,
  items,
}: {
  icon: ReactNode;
  title: string;
  items: StatItem[];
}) {
  return (
    <Card>
      <CardHeader className="flex items-center gap-2 border-b border-border">
        <span className="text-muted-foreground">{icon}</span>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${TONE_CLASS[item.tone]}`}
            >
              {item.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="truncate text-base font-semibold text-foreground">
                {item.value}
              </p>
              {item.sub ? (
                <p className="truncate text-[11px] text-muted-foreground">{item.sub}</p>
              ) : null}
            </div>
            {item.href && item.actionLabel ? (
              <Link
                href={item.href}
                className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {item.actionLabel}
              </Link>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
