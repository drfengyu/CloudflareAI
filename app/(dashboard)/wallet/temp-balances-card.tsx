"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination } from "@/components/dashboard/pagination";
import { formatCredits } from "@/lib/billing/credits";

const PAGE_SIZE = 10;

export interface SerializedTempBalance {
  id: string;
  displayAmount: number;
  usedForCompensation: number;
  description: string | null;
  expiresAtLabel: string;
}

/**
 * 临时余额明细。补正计算在服务端完成，这里只做本地分页——数据量小，
 * 翻页不需要再读库。
 */
export function TempBalancesCard({ balances }: { balances: SerializedTempBalance[] }) {
  const [page, setPage] = useState(1);

  if (balances.length === 0) return null;

  const totalPages = Math.max(1, Math.ceil(balances.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const visible = balances.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">临时余额明细</CardTitle>
        <span className="text-xs text-muted-foreground">
          共 {balances.length} 条 · 每页 {PAGE_SIZE} 条
        </span>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {visible.map((tb) => (
            <div
              key={tb.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
            >
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {formatCredits(tb.displayAmount)} credits
                  {tb.usedForCompensation > 0 && (
                    <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                      ({formatCredits(tb.usedForCompensation)} 已用于补正)
                    </span>
                  )}
                </p>
                {tb.description && (
                  <p className="text-xs text-muted-foreground">{tb.description}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">过期时间</p>
                <p className="text-sm">{tb.expiresAtLabel}</p>
              </div>
            </div>
          ))}
        </div>
        <Pagination page={current} totalPages={totalPages} onPageChange={setPage} />
      </CardContent>
    </Card>
  );
}
