"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pagination } from "@/components/dashboard/pagination";
import { formatCnWallClock } from "@/lib/date";
import { formatCredits } from "@/lib/billing/credits";
import { cn } from "@/lib/utils";
import { listMyFlipRounds } from "@/app/(dashboard)/flip/actions";
import type { FlipRoundView } from "@/lib/flip/records";
import { couponTickets } from "@/lib/activity/ticket-math";
import { CouponCount } from "@/components/activity/coupon-badge";

function Delta({ value, mixed = false }: { value: number; mixed?: boolean }) {
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        value > 0
          ? "text-success"
          : value < 0
            ? "text-[color:var(--destructive)]"
            : "text-muted-foreground",
      )}
    >
      {value > 0 ? "+" : ""}
      {formatCredits(value)} {mixed ? "cr 等值" : "cr"}
    </span>
  );
}

/** 券奖的盈亏按张数算：发出张数 − 票价张数。 */
function TicketDelta({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        value > 0
          ? "text-success"
          : value < 0
            ? "text-[color:var(--destructive)]"
            : "text-muted-foreground",
      )}
    >
      {value > 0 ? "+" : ""}
      {value} 张
    </span>
  );
}

/**
 * 我的牌局：一行一局；还没翻完的那局标「待翻开」，盈亏留空。
 * 每页 10 局，翻页只换这张表（`listMyFlipRounds`），不改 URL、不整页刷新。
 */
export function FlipRoundList({
  rounds: initialRounds,
  hasNext: initialHasNext,
  unitCredits,
}: {
  rounds: FlipRoundView[];
  /** 服务端多取一条探测出的「还有下一页」 */
  hasNext: boolean;
  /** 1 张活动券 = 多少 cr，用来把历史票价换算成整张数。 */
  unitCredits: number;
}) {
  const [rounds, setRounds] = useState(initialRounds);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(initialHasNext);
  const [paging, setPaging] = useState(false);

  const goToPage = async (target: number) => {
    if (paging || target < 1 || target === page) return;
    setPaging(true);
    try {
      const result = await listMyFlipRounds(target);
      setRounds(result.rounds);
      setHasNext(result.hasNext);
      setPage(target);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载牌局记录失败");
    } finally {
      setPaging(false);
    }
  };

  if (rounds.length === 0) {
    return <p className="text-sm text-muted-foreground">本期还没有牌局，开一局就会出现在这里。</p>;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">时间</th>
              <th className="px-3 py-2 font-medium">翻开</th>
              <th className="px-3 py-2 font-medium">票价</th>
              <th className="px-3 py-2 font-medium">中奖</th>
              <th className="px-3 py-2 font-medium">本局盈亏</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rounds.map((round) => {
              const reward = round.reward;
              return (
                <tr key={round.id} className="hover:bg-secondary/30">
                  <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                    {formatCnWallClock(round.createdAt)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {reward === null ? (
                      <span className="text-xs text-muted-foreground">待翻开</span>
                    ) : (
                      `第 ${Number(round.position) + 1} 张`
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    <CouponCount
                      kind="flip"
                      count={couponTickets(round.priceCredits, unitCredits)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {reward === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : round.rewardTickets !== null ? (
                      <CouponCount kind="flip" count={round.rewardTickets} />
                    ) : reward > 0 ? (
                      <span className="font-medium tabular-nums text-success">
                        +{formatCredits(reward)} tcr
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">空牌</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {reward === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : round.rewardTickets !== null ? (
                      <TicketDelta
                        value={round.rewardTickets - couponTickets(round.priceCredits, unitCredits)}
                      />
                    ) : (
                      <Delta value={reward - round.priceCredits} mixed />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} hasNext={hasNext} onPageChange={goToPage} disabled={paging} />
    </div>
  );
}
