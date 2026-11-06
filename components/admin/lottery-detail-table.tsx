"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/dashboard/pagination";
import { formatCredits } from "@/lib/billing/credits";
import { formatCnWallClock } from "@/lib/date";
import { drawNetCredits } from "@/lib/lottery/prize-math";
import { cn } from "@/lib/utils";
import { listAdminDrawRecords, type AdminDrawRow } from "@/app/(dashboard)/admin/lottery/actions";
import type { DrawRecord } from "@/lib/lottery/records";

const TICKET_LABEL: Record<DrawRecord["ticketSource"], string> = {
  buy: "购买",
  gift: "赠送",
  prize: "抽中",
  free: "免费",
  unknown: "已失效",
};

function Signed({ value, suffix = " cr" }: { value: number; suffix?: string }) {
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        value > 0
          ? "text-[color:var(--primary)]"
          : value < 0
            ? "text-[color:var(--destructive)]"
            : "text-muted-foreground",
      )}
    >
      {value > 0 ? "+" : ""}
      {formatCredits(value)}
      {suffix}
    </span>
  );
}

/**
 * 后台「逐次明细」表：每页 10 注，翻页只换这张表（`listAdminDrawRecords`），
 * 不改 URL、不整页刷新；时间窗 `range` 由页面决定并原样带回，与首屏口径一致。
 */
export function LotteryDetailTable({
  rows: initialRows,
  range,
  totalPages: initialTotalPages,
}: {
  rows: AdminDrawRow[];
  range: string;
  totalPages: number;
}) {
  const [rows, setRows] = useState(initialRows);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [paging, setPaging] = useState(false);

  const goToPage = async (target: number) => {
    if (paging || target < 1 || target > totalPages || target === page) return;
    setPaging(true);
    try {
      const result = await listAdminDrawRecords(target, range);
      setRows(result.rows);
      setTotalPages(result.totalPages);
      setPage(target);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载逐次明细失败");
    } finally {
      setPaging(false);
    }
  };

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">该时段没有开奖记录。</p>;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">时间</th>
              <th className="px-3 py-2 font-medium">用户</th>
              <th className="px-3 py-2 font-medium">圈层</th>
              <th className="px-3 py-2 font-medium">结果</th>
              <th className="px-3 py-2 font-medium">用户 cr 变动</th>
              <th className="px-3 py-2 font-medium">券</th>
              <th className="px-3 py-2 font-medium">站点净收益</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-secondary/30">
                <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                  {r.createdAt ? formatCnWallClock(r.createdAt) : "—"}
                </td>
                <td className="px-3 py-2">{r.email ?? r.userId.slice(0, 8)}</td>
                <td className="px-3 py-2">
                  <Badge tone={r.ring === "outer" ? "accent" : "muted"} className="text-[10px]">
                    {r.ring === "outer" ? "外圈" : "内圈"}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  {r.label}
                  {r.ring === "outer" && r.multiplier !== null && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      （×{r.multiplier}，基数 {formatCredits(r.baseCredits)} cr）
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.deltaCredits === 0 && r.grantTickets > 0 ? (
                    <span className="text-xs text-muted-foreground">不发 cr（赠券档）</span>
                  ) : (
                    <Signed value={r.deltaCredits} />
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                  {TICKET_LABEL[r.ticketSource]}
                  {r.ticketSource === "buy" ? ` ${formatCredits(r.ticketCredits)} cr` : ""}
                </td>
                <td className="px-3 py-2">
                  <Signed value={drawNetCredits(r)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={goToPage}
        disabled={paging}
      />
    </div>
  );
}
