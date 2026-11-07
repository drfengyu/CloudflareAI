import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCredits } from "@/lib/billing/credits";
import { ledgerEntryLabel, type LedgerRecentEntry, type LedgerTotals } from "@/lib/billing/ledger";
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
 * 钱包页的「最近收支」：只列最近几笔变动和一个窗口合计（近 90 天），
 * 完整的天表与分类小计在 /ledger，这里不重复铺开历史。
 */
export function RecentLedgerCard({
  entries,
  totals,
  net,
}: {
  entries: LedgerRecentEntry[];
  totals: LedgerTotals;
  net: number;
}) {
  const netSigned = signed(net);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">最近收支</CardTitle>
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

        {entries.length > 0 ? (
          <p className="flex flex-wrap gap-x-3 pt-1 text-xs text-muted-foreground tabular-nums">
            <span>这 {entries.length} 笔合计</span>
            <span className="text-success">收入 +{formatCredits(totals.income)}</span>
            <span className="text-destructive">支出 −{formatCredits(totals.expense)}</span>
            <span className={netSigned.tone}>净 {netSigned.text} cr</span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
