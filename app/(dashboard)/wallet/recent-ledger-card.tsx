import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCredits } from "@/lib/billing/credits";
import {
  ledgerEntryLabel,
  ledgerGap,
  ledgerNet,
  type LedgerRecentEntry,
  type LedgerTotals,
} from "@/lib/billing/ledger";
import { formatCnDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";

function signed(value: number): { text: string; tone: string } {
  if (value === 0) return { text: "0", tone: "text-muted-foreground" };
  return {
    text: `${value > 0 ? "+" : "−"}${formatCredits(Math.abs(value))}`,
    tone: value > 0 ? "text-success" : "text-destructive",
  };
}

/**
 * 钱包页的「最近收支」：列出近 90 天最近几笔变动，完整天表与分类小计在 /ledger。
 *
 * 最近几笔只是样本，和余额没有对账关系；钱包顶部余额要对的是账本全量：
 * 余额 = 累计净收支 + 差额。这里把累计与差额一起列出，避免「合计」被当成余额合计。
 */
export function RecentLedgerCard({
  entries,
  totals,
  net,
  limit,
  lifetime,
  balance,
}: {
  entries: LedgerRecentEntry[];
  totals: LedgerTotals;
  net: number;
  limit: number;
  lifetime: LedgerTotals;
  balance: number;
}) {
  const netSigned = signed(net);
  const lifetimeNet = ledgerNet(lifetime);
  const lifetimeNetSigned = signed(lifetimeNet);
  const gap = ledgerGap(balance, lifetime);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="space-y-0.5">
          <CardTitle className="text-base">最近收支</CardTitle>
          <p className="text-xs text-muted-foreground">近 90 天 · 最近 {limit} 笔</p>
        </div>
        <Link href="/ledger" className="text-xs text-muted-foreground hover:text-foreground">
          查看个人账本 →
        </Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">近 90 天没有收支记录，更早的账目见个人账本。</p>
        ) : (
          entries.map((entry, index) => {
            const row = signed(entry.income - entry.expense);
            return (
              <div
                key={`${entry.ts}-${index}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{ledgerEntryLabel(entry)}</p>
                  <p className="text-xs text-muted-foreground">{formatCnDateTime(entry.ts)}</p>
                </div>
                <p className={cn("shrink-0 text-sm font-semibold tabular-nums", row.tone)}>
                  {row.text} cr
                </p>
              </div>
            );
          })
        )}

        {lifetime.income !== 0 || lifetime.expense !== 0 || Math.abs(gap) >= 0.01 ? (
          <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground tabular-nums">
            <p className="flex flex-wrap gap-x-3">
              <span className="font-medium text-foreground">账本累计</span>
              <span className="text-success">收入 +{formatCredits(lifetime.income)}</span>
              <span className="text-destructive">支出 −{formatCredits(lifetime.expense)}</span>
              <span className={lifetimeNetSigned.tone}>净收支 {lifetimeNetSigned.text} cr</span>
            </p>
            {Math.abs(gap) >= 0.01 ? (
              <p>
                净收支与总余额相差 {signed(gap).text} cr：到期作废的临时余额、早期未计量的调用、
                管理员直接调整的余额都不进账本，所以合计不等于余额。
              </p>
            ) : (
              <p>账本累计净收支与总余额一致。</p>
            )}
          </div>
        ) : null}

        {entries.length > 0 ? (
          <p className="flex flex-wrap gap-x-3 pt-1 text-xs text-muted-foreground tabular-nums">
            <span>上面这 {entries.length} 笔只是近 90 天的最近几笔，不是余额合计</span>
            <span className="text-success">收入 +{formatCredits(totals.income)}</span>
            <span className="text-destructive">支出 −{formatCredits(totals.expense)}</span>
            <span className={netSigned.tone}>净 {netSigned.text} cr</span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
