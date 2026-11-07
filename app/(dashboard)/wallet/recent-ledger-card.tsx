"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCredits } from "@/lib/billing/credits";
import type { LedgerRecentDay } from "@/lib/billing/ledger";
import { cn } from "@/lib/utils";

function Amount({
  income,
  expense,
  className,
}: {
  income: number;
  expense: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex shrink-0 items-baseline gap-2 tabular-nums", className)}>
      {income >= 0.005 ? (
        <span className="text-success">+{formatCredits(income)}</span>
      ) : null}
      {expense >= 0.005 ? (
        <span className="text-destructive">−{formatCredits(expense)}</span>
      ) : null}
      {income < 0.005 && expense < 0.005 ? (
        <span className="text-muted-foreground">0</span>
      ) : null}
    </span>
  );
}

function netOf(day: { income: number; expense: number }): number {
  return Math.round((day.income - day.expense) * 100) / 100;
}

function netClass(net: number): string {
  if (Math.abs(net) < 0.005) return "text-muted-foreground";
  return net > 0 ? "text-success" : "text-destructive";
}

/**
 * 钱包页的「最近收支」：近 5 天、最多 50 笔，按北京日期分组。
 * 折叠时只看当天净额，点开看当天各类收支小计；完整账目在 /ledger。
 */
export function RecentLedgerCard({ days }: { days: LedgerRecentDay[] }) {
  const [openDate, setOpenDate] = useState<string | null>(null);

  const totals = days.reduce(
    (sum, day) => ({ income: sum.income + day.income, expense: sum.expense + day.expense }),
    { income: 0, expense: 0 },
  );
  const net = netOf(totals);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="space-y-0.5">
          <CardTitle className="text-base">最近收支</CardTitle>
          <p className="text-xs text-muted-foreground">近 5 天 · 最多 50 笔 · 按天汇总</p>
        </div>
        <Link href="/ledger" className="text-xs text-muted-foreground hover:text-foreground">
          查看个人账本 →
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">近 5 天没有收支记录，更早的账目见个人账本。</p>
        ) : (
          days.map((day) => {
            const open = openDate === day.date;
            const dayNet = netOf(day);
            return (
              <div key={day.date} className="overflow-hidden rounded-lg border border-border bg-card">
                <button
                  type="button"
                  onClick={() => setOpenDate(open ? null : day.date)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-secondary/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums">{day.date}</p>
                    <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                      <span>{day.entries} 笔</span>
                      <Amount income={day.income} expense={day.expense} />
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={cn("text-sm font-semibold tabular-nums", netClass(dayNet))}>
                      {Math.abs(dayNet) < 0.005
                        ? "0"
                        : `${dayNet > 0 ? "+" : "−"}${formatCredits(Math.abs(dayNet))}`}{" "}
                      <span className="text-xs font-normal text-muted-foreground">cr</span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </div>
                </button>

                {open ? (
                  <div className="border-t border-border px-3 pb-2.5 pt-1">
                    {day.rows.map((row) => (
                      <div
                        key={row.category}
                        className="flex items-center justify-between gap-3 py-1.5 text-xs"
                      >
                        <p className="min-w-0">
                          <span className="font-medium">{row.label}</span>
                          <span className="ml-2 text-muted-foreground">{row.entries} 笔</span>
                        </p>
                        <Amount income={row.income} expense={row.expense} />
                      </div>
                    ))}
                    <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-2 text-xs">
                      <span className="font-medium text-muted-foreground">当天小计</span>
                      <span className="flex items-baseline gap-2 tabular-nums">
                        <Amount income={day.income} expense={day.expense} />
                        <span className={cn("font-semibold", netClass(dayNet))}>
                          净 {dayNet > 0 ? "+" : dayNet < 0 ? "−" : ""}
                          {formatCredits(Math.abs(dayNet))} cr
                        </span>
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}

        {days.length > 0 ? (
          <p className="flex flex-wrap gap-x-3 pt-1 text-xs text-muted-foreground tabular-nums">
            <span>以上为近 5 天最近 50 笔，不是余额合计</span>
            <span className="text-success">收入 +{formatCredits(totals.income)}</span>
            <span className="text-destructive">支出 −{formatCredits(totals.expense)}</span>
            <span className={netClass(net)}>净 {net > 0 ? "+" : net < 0 ? "−" : ""}{formatCredits(Math.abs(net))} cr</span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
