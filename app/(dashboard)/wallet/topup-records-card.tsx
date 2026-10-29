"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination } from "@/components/dashboard/pagination";
import { formatCredits } from "@/lib/billing/credits";
import { TOPUP_PAGE_SIZE, type SerializedTopup } from "@/lib/billing/topup-view";
import { listMyTopups } from "./actions";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TYPE_LABEL: Record<number, string> = {
  1: "兑换码充值",
  2: "管理员充值",
  3: "签到奖励",
  5: "在线充值",
  7: "邀请奖励",
};

export function TopupRecordsCard({
  records,
  initialHasNext,
}: {
  records: SerializedTopup[];
  /** 服务端多取一条探测出的「还有下一页」 */
  initialHasNext: boolean;
}) {
  const [items, setItems] = useState(records);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(initialHasNext);
  const [paging, setPaging] = useState(false);

  // 局部翻页：只换这张卡的数据，不改 URL、不整页刷新。
  const goToPage = async (target: number) => {
    if (paging || target === page) return;
    setPaging(true);
    try {
      const result = await listMyTopups(target);
      setItems(result.records);
      setHasNext(result.hasNext);
      setPage(target);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载充值记录失败");
    } finally {
      setPaging(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">充值记录</CardTitle>
        <span className="text-xs text-muted-foreground">
          仅显示最近三个月 · 每页 {TOPUP_PAGE_SIZE} 条
        </span>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无充值记录</p>
        ) : (
          <div className="space-y-2">
            {items.map((record) => (
              <div
                key={record.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {TYPE_LABEL[record.type] ?? "其他充值"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(record.createdAt), {
                      addSuffix: true,
                      locale: zhCN,
                    })}
                  </p>
                  {record.description && (
                    <p className="text-xs text-muted-foreground">{record.description}</p>
                  )}
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "text-lg font-semibold",
                      record.amount >= 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {record.amount >= 0 ? "+" : ""}
                    {formatCredits(record.amount)} cr
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        <Pagination
          page={page}
          hasNext={hasNext}
          onPageChange={goToPage}
          disabled={paging}
        />
      </CardContent>
    </Card>
  );
}
