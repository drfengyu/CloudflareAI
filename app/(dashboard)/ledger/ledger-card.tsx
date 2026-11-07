"use client";

import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pagination } from "@/components/dashboard/pagination";
import { PillTab } from "@/components/dashboard/section";
import { formatCredits } from "@/lib/billing/credits";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";
import { loadLedger, loadLedgerDay, type LedgerDayDetail, type LedgerOverview } from "./actions";
import {
  LEDGER_FILTERS,
  ledgerDisplayTotals,
  ledgerNet,
  ledgerTypeLabel,
  type LedgerDayRow,
  type LedgerFilter,
  type LedgerTotals,
} from "@/lib/billing/ledger";

/** 收支数字：收入在前显示为 +，支出为 −，0 留灰。 */
function signed(value: number, sign: "+" | "−" | null): string {
  if (value === 0) return "0";
  return `${sign ?? (value > 0 ? "+" : "−")}${formatCredits(Math.abs(value))}`;
}

const amountTone = (value: number) =>
  cn(
    "tabular-nums",
    value > 0 ? "text-success" : value < 0 ? "text-destructive" : "text-muted-foreground",
  );

/** API 消费与过期作废只有支出，再列「收入/支出」等于一列 0 加一列重复数。 */
const isExpenseOnly = (filter: LedgerFilter) => filter === "usage" || filter === "expire";

export function LedgerCard({ initial }: { initial: LedgerOverview }) {
  const [overview, setOverview] = useState(initial);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const [paging, setPaging] = useState(false);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [detail, setDetail] = useState<LedgerDayDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  /**
   * 每次「换筛选 / 换天 / 收起」都让序号 +1，回来的响应只有对上当前序号才采纳。
   * 点 A 再点 B 时 A 的请求还在飞，不判序号就会把 A 的小计画在 B 那一行下面。
   */
  const detailSeq = useRef(0);

  const apply = async (nextPage: number, nextFilter: LedgerFilter) => {
    detailSeq.current += 1;
    setPaging(true);
    try {
      const result = await loadLedger(nextPage, nextFilter);
      setOverview(result);
      setPage(nextPage);
      setFilter(nextFilter);
      // 换页或换类别都收掉当天详情，避免留着上一筛选条件下的旧小计。
      setOpenDate(null);
      setDetail(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载账本失败");
    } finally {
      setPaging(false);
    }
  };

  const toggleDay = async (date: string) => {
    const seq = ++detailSeq.current;
    if (openDate === date) {
      setOpenDate(null);
      setDetail(null);
      return;
    }
    setOpenDate(date);
    setDetail(null);
    setDetailLoading(true);
    try {
      const result = await loadLedgerDay(date, filter);
      if (seq !== detailSeq.current) return;
      setDetail(result);
    } catch (error) {
      if (seq !== detailSeq.current) return;
      toast.error(error instanceof Error ? error.message : "加载当天账目失败");
      setOpenDate(null);
    } finally {
      if (seq === detailSeq.current) setDetailLoading(false);
    }
  };

  const { totals, balance, gap } = overview;
  // 「全部」且原始差额已不足一分时，四格按分闭合显示；筛选态仍用原值，不与余额对账。
  const shownTotals =
    filter === "all" && gap === null ? ledgerDisplayTotals(totals, balance) : totals;
  const net = ledgerNet(shownTotals);
  const showInOut = !isExpenseOnly(filter);
  const columns = showInOut ? 6 : 4;
  const incomeLabel = filter === "all" ? "累计收入" : "本类收入";
  const expenseLabel = filter === "all" ? "累计支出" : "本类支出";
  const activeFilterLabel = LEDGER_FILTERS.find((item) => item.id === filter)?.label ?? "全部";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">个人账本</CardTitle>
        <span className="text-xs text-muted-foreground">每页 10 天</span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/30 p-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">当前余额</p>
            <p className="font-semibold tabular-nums">{formatCredits(balance)} cr</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{incomeLabel}</p>
            <p className="font-semibold text-success tabular-nums">{signed(shownTotals.income, "+")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{expenseLabel}</p>
            <p className="font-semibold text-destructive tabular-nums">{signed(-shownTotals.expense, "−")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{filter === "all" ? "净收支" : "本类净收支"}</p>
            <p className={cn("font-semibold", amountTone(net))}>{signed(net, null)}</p>
          </div>
        </div>

        {filter === "all" ? (
          <p className="text-xs text-muted-foreground">
            临时余额到期没用完时，清理任务会在到期日逐笔记一笔「过期作废」支出，累计支出已包含这部分。
          </p>
        ) : null}

        {gap !== null ? (
          <p className="text-xs text-muted-foreground">
            {gap > 0
              ? `账目合计比当前余额少 ${formatCredits(gap)} cr：有账外增加的余额变更没进账本，差额如实保留。`
              : `账目合计比当前余额多 ${formatCredits(-gap)} cr：有支出没进账本（早期未计量消费、未入账调整，或过期流水补记失败），差额如实保留。`}
          </p>
        ) : null}

        {filter !== "all" ? (
          <p className="text-xs text-muted-foreground">
            当前只统计「{activeFilterLabel}」，上面三项是本类别合计，不与余额对账；切回「全部」才会按累计收支对账。
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {LEDGER_FILTERS.map((item) => (
            <PillTab
              key={item.id}
              active={filter === item.id}
              disabled={paging}
              onClick={() => apply(1, item.id)}
            >
              {item.label}
            </PillTab>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          只列有进出的日子：当天既没收入也没支出、或金额记为 0 的记录不显示。点「当天分类」看这天每类的收支与净收入。
        </p>

        {overview.days.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filter === "all" ? "还没有账目记录。" : "该类别下还没有账目记录。"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">日期</th>
                  {showInOut ? (
                    <>
                      <th className="hidden py-2 text-right font-medium sm:table-cell">收入</th>
                      <th className="hidden py-2 text-right font-medium sm:table-cell">支出</th>
                    </>
                  ) : null}
                  <th className="py-2 text-right font-medium">净收入</th>
                  <th className="py-2 text-right font-medium">笔数</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {overview.days.map((day) => {
                  const open = openDate === day.date;
                  return (
                    <DayRows
                      key={day.date}
                      day={day}
                      open={open}
                      detail={open ? detail : null}
                      detailLoading={open && detailLoading}
                      showInOut={showInOut}
                      columns={columns}
                      onToggle={() => toggleDay(day.date)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          hasNext={overview.hasNext}
          onPageChange={(target) => void apply(target, filter)}
          disabled={paging}
        />
      </CardContent>
    </Card>
  );
}

/**
 * 一天一行；展开后每类一行、末尾一行当天合计。
 * 类型行与合计行都按父表同一套列渲染，数字才跟父行对齐。
 */
function DayRows({
  day,
  open,
  detail,
  detailLoading,
  showInOut,
  columns,
  onToggle,
}: {
  day: LedgerDayRow;
  open: boolean;
  detail: LedgerDayDetail | null;
  detailLoading: boolean;
  showInOut: boolean;
  columns: number;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-t border-border">
        <AmountCells row={day} showInOut={showInOut} label={day.date} entries={day.entries} />
        <td className="py-2 text-right">
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            当天分类
          </button>
        </td>
      </tr>
      {open ? (
        detailLoading || !detail || detail.rows.length === 0 ? (
          <tr className="border-t border-border bg-muted/30">
            <td colSpan={columns} className="py-2 pl-5 text-xs text-muted-foreground">
              {detailLoading ? "正在统计当天账目…" : "当天没有符合条件的账目。"}
            </td>
          </tr>
        ) : (
          <>
            {detail.rows.map((row) => (
              <tr key={`${row.category}-${row.typeCode}`} className="border-t border-border/60 bg-muted/30 text-xs">
                <AmountCells
                  row={row}
                  showInOut={showInOut}
                  label={ledgerTypeLabel(row)}
                  entries={row.entries}
                  indent
                />
                <td />
              </tr>
            ))}
            <tr className="border-t border-border bg-muted/30 text-xs font-medium">
              <AmountCells
                row={detail.totals}
                showInOut={showInOut}
                label="当天合计"
                entries={detail.rows.reduce((sum, row) => sum + row.entries, 0)}
                indent
              />
              <td />
            </tr>
          </>
        )
      ) : null}
    </>
  );
}

/** 日期/名称 + 收入 + 支出 + 净收入 + 笔数；`showInOut` 为假时收掉中间两列。 */
function AmountCells({
  row,
  showInOut,
  label,
  entries,
  indent = false,
}: {
  row: LedgerTotals;
  showInOut: boolean;
  label: string;
  entries: number;
  indent?: boolean;
}) {
  const net = ledgerNet(row);
  return (
    <>
      <td className={cn("py-2 text-xs", indent ? "pl-5" : "font-mono")}>{label}</td>
      {showInOut ? (
        <>
          <td className="hidden py-2 text-right text-success tabular-nums sm:table-cell">
            {signed(row.income, "+")}
          </td>
          <td className="hidden py-2 text-right text-destructive tabular-nums sm:table-cell">
            {signed(-row.expense, "−")}
          </td>
        </>
      ) : null}
      <td className={cn("py-2 text-right", amountTone(net))}>{signed(net, null)}</td>
      <td className="py-2 text-right text-xs text-muted-foreground tabular-nums">{entries}</td>
    </>
  );
}
