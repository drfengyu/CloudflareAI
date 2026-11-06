"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/dashboard/pagination";
import { formatCredits } from "@/lib/billing/credits";
import { formatCnWallClock } from "@/lib/date";
import { DRAW_RECORD_PAGE_SIZE, type DrawRecord } from "@/lib/lottery/records";
import { drawNetCredits, round2 } from "@/lib/lottery/prize-math";
import { cn } from "@/lib/utils";
import {
  listAdminDrawRecords,
  loadActivityReport,
  type AdminActivityReport,
} from "@/app/(dashboard)/admin/lottery/actions";

const RANGE_TABS: { value: string; label: string }[] = [
  { value: "today", label: "今日" },
  { value: "7d", label: "近 7 日" },
  { value: "30d", label: "近 30 日" },
  { value: "all", label: "全部" },
];

const TICKET_LABEL: Record<DrawRecord["ticketSource"], string> = {
  buy: "购买",
  gift: "赠送",
  prize: "抽中",
  free: "免费",
  unknown: "已失效",
};

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          tone === "positive" && "text-[color:var(--primary)]",
          tone === "negative" && "text-[color:var(--destructive)]",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

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
 * 活动记录报告：时间窗标签、概览数字、按用户汇总、逐次明细共用一份状态。
 *
 * 切窗口一次换全套（`loadActivityReport`），只翻页时只换明细（`listAdminDrawRecords`）——
 * 概览若跟着单页明细走会自相矛盾，所以窗口与页码分开取。两条路径都不改 URL、不整页刷新。
 */
export function LotteryReport({
  range: initialRange,
  activitySummary,
  rateHint,
  report: initialReport,
}: {
  range: string;
  /** 活动状态 + 起止时间 + 券价 + 外圈概率，全部来自配置，与时间窗无关，由服务端算好传入。 */
  activitySummary: string;
  rateHint: string;
  report: AdminActivityReport;
}) {
  const [range, setRange] = useState(initialRange);
  const [report, setReport] = useState(initialReport);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const { balance, ticketTotals, perUser, detail } = report;
  const actualRate =
    balance.ticketFace > 0
      ? round2(((balance.paidOut - balance.clawedBack) / balance.ticketFace) * 100)
      : null;

  const selectRange = async (target: string) => {
    if (loading || target === range) return;
    setLoading(true);
    try {
      setReport(await loadActivityReport(target));
      setRange(target);
      setPage(1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载活动记录失败");
    } finally {
      setLoading(false);
    }
  };

  const goToPage = async (target: number) => {
    if (loading || target < 1 || target > detail.totalPages || target === page) return;
    setLoading(true);
    try {
      const result = await listAdminDrawRecords(target, range);
      setReport((prev) => ({ ...prev, detail: result }));
      setPage(target);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载逐次明细失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            收益概览
            <span className="ml-2 text-xs font-normal text-muted-foreground">{activitySummary}</span>
          </CardTitle>
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {RANGE_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                disabled={loading}
                onClick={() => selectRange(tab.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
                  range === tab.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className={cn("space-y-3", loading && "opacity-60")}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Metric
              label="站点净收益"
              value={`${formatCredits(balance.net)} cr`}
              tone={balance.net >= 0 ? "positive" : "negative"}
              hint="券面 + 回收 − 发放"
            />
            <Metric
              label="售券收入"
              value={`${formatCredits(ticketTotals.boughtCredits)} cr`}
              hint={`${ticketTotals.boughtTickets} 张 · 赠券 档位 ${ticketTotals.giftTickets} / 奖池 ${ticketTotals.prizeTickets} 张`}
            />
            <Metric
              label="中奖发放"
              value={`${formatCredits(balance.paidOut)} cr`}
              tone="negative"
              hint={`${balance.draws} 次开奖`}
            />
            <Metric label="倒扣回收" value={`${formatCredits(balance.clawedBack)} cr`} tone="positive" />
            <Metric label="参与人数" value={`${perUser.length}`} hint={`外圈命中 ${balance.outerHits} 次`} />
            <Metric
              label="实际返还率"
              value={actualRate === null ? "—" : `${actualRate}%`}
              hint={rateHint}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            净收益只统计已开奖的券；窗口内还有 {ticketTotals.unusedTickets} 张未开奖（面值{" "}
            {formatCredits(ticketTotals.unusedCredits)} cr）已收讫未兑现。倒扣回收是把用户已有余额划回，
            不是新增现金流入；中奖发放走带过期的临时余额，过期未用不会真的付出。
            赠券档不动 cr，它按「这一注的券面已收、兑付延后」落在净收益里，发出去的券要等它被抽掉才转成成本。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">按用户</CardTitle>
        </CardHeader>
        <CardContent>
          {perUser.length === 0 ? (
            <p className="text-sm text-muted-foreground">该时段没有开奖记录。</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">用户</th>
                    <th className="px-3 py-2 font-medium">抽奖次数</th>
                    <th className="px-3 py-2 font-medium">外圈命中</th>
                    <th className="px-3 py-2 font-medium">已开奖券面值</th>
                    <th className="px-3 py-2 font-medium">中奖发放</th>
                    <th className="px-3 py-2 font-medium">倒扣回收</th>
                    <th className="px-3 py-2 font-medium">站点净收益</th>
                    <th className="px-3 py-2 font-medium">最近参与</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {perUser.map((u) => (
                    <tr key={u.userId} className="hover:bg-secondary/30">
                      <td className="px-3 py-2">{u.email}</td>
                      <td className="px-3 py-2 tabular-nums">{u.draws}</td>
                      <td className="px-3 py-2 tabular-nums">{u.outerHits}</td>
                      <td className="px-3 py-2 tabular-nums">{formatCredits(u.ticketFace)} cr</td>
                      <td className="px-3 py-2 tabular-nums text-[color:var(--destructive)]">
                        {formatCredits(u.paidOut)} cr
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[color:var(--primary)]">
                        {formatCredits(u.clawedBack)} cr
                      </td>
                      <td className="px-3 py-2">
                        <Signed value={u.net} />
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                        {u.lastDrawAt ? formatCnWallClock(u.lastDrawAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            逐次明细
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              共 {detail.totalRecords} 注 · 每页 {DRAW_RECORD_PAGE_SIZE} 条 · 收益按单注口径：券面 + 回收 − 发放
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {detail.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">该时段没有开奖记录。</p>
          ) : (
            <div className={cn("space-y-2", loading && "opacity-60")}>
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
                    {detail.rows.map((r) => (
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
                totalPages={detail.totalPages}
                onPageChange={goToPage}
                disabled={loading}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
