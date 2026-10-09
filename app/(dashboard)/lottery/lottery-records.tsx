"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCredits } from "@/lib/billing/credits";
import { formatCnWallClock } from "@/lib/date";
import { cn } from "@/lib/utils";
import type {
  DrawRecord,
  LotteryBalance,
  LotteryTicketTotals,
} from "@/lib/lottery/records";

const TICKET_LABEL: Record<DrawRecord["ticketSource"], string> = {
  buy: "购买",
  gift: "赠送",
  prize: "抽中",
  free: "免费",
  unknown: "已失效",
};

function Delta({ value }: { value: number }) {
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
      {formatCredits(value)} cr
    </span>
  );
}

/** 汇总格：值 + 口径说明，两者都放在数据侧算好，这里只排版。 */
function Stat({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{children}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function LotteryEmpty() {
  return <p className="text-sm text-muted-foreground">还没有开奖记录，抽一次就会出现在这里。</p>;
}

/** 单轮活动的记录表头与明细行。 */
function ActivityRoundTable({ records }: { records: DrawRecord[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-secondary/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">时间</th>
            <th className="px-3 py-2 font-medium">圈层</th>
            <th className="px-3 py-2 font-medium">结果</th>
            <th className="px-3 py-2 font-medium">cr 变动</th>
            <th className="px-3 py-2 font-medium">抽奖券</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {records.map((r) => (
            <tr key={r.id} className="hover:bg-secondary/30">
              <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                {r.createdAt ? formatCnWallClock(r.createdAt) : "—"}
              </td>
              <td className="px-3 py-2">
                <Badge tone={r.ring === "outer" ? "accent" : "muted"} className="text-[10px]">
                  {r.ring === "outer" ? "外圈" : "内圈"}
                </Badge>
              </td>
              <td className="px-3 py-2">
                {r.label}
                {r.ring === "outer" && r.baseCredits > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    （基数 {formatCredits(r.baseCredits)} cr）
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                {r.deltaCredits === 0 && r.grantTickets > 0 ? (
                  <span className="text-muted-foreground">不发 cr</span>
                ) : (
                  <Delta value={r.deltaCredits} />
                )}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {TICKET_LABEL[r.ticketSource]}
                {r.ticketSource === "buy" && ` ${formatCredits(r.ticketCredits)} cr`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 我的活动记录：逐次开奖的时间、落在哪一圈、结算 cr 与用掉的券。
 *
 * 按活动轮次分组：当前活动展开、旧活动折叠。
 * 汇总分两行：当前活动战绩（新活动重计）+ 全部活动累计战绩。
 * 净收益按**已开奖的券**算（中奖 − 倒扣 − 券面），没开奖的券还挂在券包里，不计盈也不计亏。
 */
export function LotteryRecords({
  balance,
  currentBalance,
  tickets,
  records,
  ticketsLeft,
  recordLimit,
  currentActivityKey,
  currentActivityLabel,
}: {
  balance: LotteryBalance;
  /** 当前活动轮次的战绩；null 表示活动未启用或无当前轮次。 */
  currentBalance: LotteryBalance | null;
  tickets: LotteryTicketTotals;
  records: DrawRecord[];
  ticketsLeft: number;
  recordLimit: number;
  /** 当前活动轮次标识；null 表示历史数据。 */
  currentActivityKey: string | null;
  /** 当前活动的显示标签（通常是 startAt）。 */
  currentActivityLabel: string;
}) {
  // 按 activityKey 分组；null 归为"历史活动"。
  const groups = new Map<string, DrawRecord[]>();
  for (const r of records) {
    const key = r.activityKey ?? "__historical__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  // 当前活动的记录（如果有）
  const currentKey = currentActivityKey ?? "__historical__";
  const currentRecords = groups.get(currentKey) ?? [];
  // 旧活动分组（排除当前活动）
  const oldGroups = [...groups.entries()].filter(([key]) => key !== currentKey);

  // 折叠状态：默认旧活动全部折叠
  const [expandedRounds, setExpandedRounds] = useState<Set<string>>(new Set());
  const toggleRound = (key: string) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const roundLabel = (key: string) => (key === "__historical__" ? "历史活动" : key);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-baseline justify-between gap-3 text-base">
          <span>我的活动记录</span>
          <span className="text-xs font-normal text-muted-foreground">
            明细为最近 {recordLimit} 次，按活动轮次分组
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {records.length === 0 ? (
          <LotteryEmpty />
        ) : (
          <>
            {/* 当前活动战绩（新活动重计） */}
            {currentBalance && (
              <div>
                <p className="mb-2 text-xs font-medium text-[color:var(--primary)]">
                  当前活动（{currentActivityLabel}）战绩
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  <Stat label="抽奖次数" hint={`外圈命中 ${currentBalance.outerHits} 次`}>
                    {currentBalance.draws}
                  </Stat>
                  <Stat label="中奖发放">
                    <span className="text-[color:var(--primary)]">
                      +{formatCredits(currentBalance.paidOut)} cr
                    </span>
                  </Stat>
                  <Stat label="倒扣回收">
                    <span className="text-[color:var(--destructive)]">
                      −{formatCredits(currentBalance.clawedBack)} cr
                    </span>
                  </Stat>
                  <Stat label="已开奖券面值">
                    {formatCredits(currentBalance.ticketFace)} cr
                  </Stat>
                  <Stat label="本期净收益" hint="中奖 − 倒扣 − 券面">
                    <Delta value={-currentBalance.net} />
                  </Stat>
                </div>
              </div>
            )}

            {/* 全部活动累计战绩 */}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">全部活动累计战绩</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <Stat label="抽奖次数" hint={`外圈命中 ${balance.outerHits} 次`}>
                  {balance.draws}
                </Stat>
                <Stat label="中奖发放">
                  <span className="text-[color:var(--primary)]">
                    +{formatCredits(balance.paidOut)} cr
                  </span>
                </Stat>
                <Stat label="倒扣回收">
                  <span className="text-[color:var(--destructive)]">
                    −{formatCredits(balance.clawedBack)} cr
                  </span>
                </Stat>
                <Stat label="已开奖券面值" hint={`累计购券 ${formatCredits(tickets.boughtCredits)} cr`}>
                  {formatCredits(balance.ticketFace)} cr
                </Stat>
                <Stat label="累计净收益" hint="中奖 − 倒扣 − 券面">
                  <Delta value={-balance.net} />
                </Stat>
              </div>
            </div>

            {/* 当前活动明细（展开） */}
            {currentRecords.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium">
                  当前活动明细（{currentRecords.length} 条）
                </p>
                <ActivityRoundTable records={currentRecords} />
              </div>
            )}

            {/* 旧活动明细（折叠，点击展开） */}
            {oldGroups.map(([key, groupRecords]) => {
              const expanded = expandedRounds.has(key);
              return (
                <div key={key}>
                  <button
                    type="button"
                    onClick={() => toggleRound(key)}
                    className="mb-2 flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-xs hover:bg-secondary/30"
                  >
                    <span className="font-medium text-muted-foreground">
                      {roundLabel(key)}（{groupRecords.length} 条记录）
                    </span>
                    <span className="text-muted-foreground">{expanded ? "收起 ▲" : "展开 ▼"}</span>
                  </button>
                  {expanded && <ActivityRoundTable records={groupRecords} />}
                </div>
              );
            })}

            <p className="text-[11px] text-muted-foreground">
              券包中尚有 {ticketsLeft} 张未开奖（其中购得面值 {formatCredits(tickets.unusedCredits)}{" "}
              cr），这部分不计入净收益；普通中奖以临时余额发放（过期未用自动作废），标注「永久」的奖品直接进永久余额、不过期。
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
