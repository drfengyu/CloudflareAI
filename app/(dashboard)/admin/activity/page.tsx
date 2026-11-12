import { Fragment } from "react";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageBody } from "@/components/dashboard/section";
import { Pagination } from "@/components/dashboard/pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db/d1-http";
import { users } from "@/lib/db/schema";
import { requireUser } from "@/lib/usage/meter";
import { formatCredits } from "@/lib/billing/credits";
import { cn } from "@/lib/utils";
import {
  ACTIVITY_LEDGER_PAGE_DAYS,
  ACTIVITY_LEDGER_RANGES,
  listActivityLedgerActivityTotals,
  listActivityLedgerDays,
  listActivityLedgerUsers,
  sumActivityLedger,
  type ActivityLedgerActivityTotal,
  type ActivityLedgerDay,
  type ActivityLedgerRange,
  type ActivityLedgerUserRow,
} from "@/lib/activity/ledger-report";

export const dynamic = "force-dynamic";

/** 站点视角：收入为正、支出为负，0 留灰。 */
function signed(value: number, sign: "+" | "−" | null): string {
  if (value === 0) return "0";
  return `${sign ?? (value > 0 ? "+" : "−")}${formatCredits(Math.abs(value))}`;
}

const netTone = (value: number) =>
  cn(
    "tabular-nums",
    value > 0 ? "text-success" : value < 0 ? "text-destructive" : "text-muted-foreground",
  );

function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tabular-nums", tone)}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** 一天的表头行 + 各活动小计行；日期只在表头出现一次。 */
function DayRows({ day }: { day: ActivityLedgerDay }) {
  const net = day.income - day.expense;
  return (
    <>
      <tr className="border-t border-border bg-secondary/40 font-medium">
        <td className="py-2 font-mono">{day.date}</td>
        <td className="py-2 text-xs text-muted-foreground">当天合计</td>
        <td className="py-2 text-right text-success tabular-nums">{signed(day.income, "+")}</td>
        <td className="py-2 text-right text-destructive tabular-nums">{signed(-day.expense, "−")}</td>
        <td className={cn("py-2 text-right", netTone(net))}>{signed(net, null)}</td>
        <td className="py-2 text-right text-xs text-muted-foreground tabular-nums">{day.entries}</td>
      </tr>
      {day.cells.map((cell) => {
        const cellNet = cell.income - cell.expense;
        return (
          <tr key={cell.key} className="border-t border-border/60 text-xs">
            <td />
            <td className="py-1.5 pl-4">{cell.label}</td>
            <td className="py-1.5 text-right text-success tabular-nums">{signed(cell.income, "+")}</td>
            <td className="py-1.5 text-right text-destructive tabular-nums">{signed(-cell.expense, "−")}</td>
            <td className={cn("py-1.5 text-right", netTone(cellNet))}>{signed(cellNet, null)}</td>
            <td className="py-1.5 text-right text-muted-foreground tabular-nums">{cell.entries}</td>
          </tr>
        );
      })}
    </>
  );
}

const USERS_PER_PAGE = 10;

function ActivityTotalRow({ row }: { row: ActivityLedgerActivityTotal }) {
  const net = row.income - row.expense;
  return (
    <tr className="border-t border-border/60">
      <td className="py-2 font-medium">{row.label}</td>
      <td className="py-2 text-right text-success tabular-nums">{signed(row.income, "+")}</td>
      <td className="py-2 text-right text-destructive tabular-nums">{signed(-row.expense, "−")}</td>
      <td className={cn("py-2 text-right", netTone(net))}>{signed(net, null)}</td>
      <td className="py-2 text-right text-muted-foreground tabular-nums">{row.users}</td>
      <td className="py-2 text-right text-muted-foreground tabular-nums">{row.entries}</td>
    </tr>
  );
}

function UserRows({ rows }: { rows: ActivityLedgerUserRow[] }) {
  return (
    <>
      {rows.map((row) => {
        const net = row.income - row.expense;
        return (
          <tr key={row.userId} className="border-t border-border/60">
            <td className="max-w-[12rem] truncate py-2 font-medium" title={row.label}>
              {row.label}
            </td>
            <td className="py-2">
              <div className="flex flex-wrap gap-1">
                {row.cells.map((cell) => (
                  <span
                    key={cell.key}
                    className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground"
                    title={`${cell.label}：付入 ${formatCredits(cell.income)} cr / 领出 ${formatCredits(cell.expense)} cr`}
                  >
                    {cell.label}
                    <span className="ml-1 tabular-nums text-foreground/70">
                      {cell.income > 0 ? `付 ${formatCredits(cell.income)}` : ""}
                      {cell.income > 0 && cell.expense > 0 ? " · " : ""}
                      {cell.expense > 0 ? `领 ${formatCredits(cell.expense)}` : ""}
                    </span>
                  </span>
                ))}
              </div>
            </td>
            <td className="py-2 text-right text-success tabular-nums">{signed(row.income, "+")}</td>
            <td className="py-2 text-right text-destructive tabular-nums">{signed(-row.expense, "−")}</td>
            <td className={cn("py-2 text-right", netTone(net))}>{signed(net, null)}</td>
            <td className="py-2 text-right text-muted-foreground tabular-nums">{row.entries}</td>
          </tr>
        );
      })}
    </>
  );
}

export default async function AdminActivityLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; page?: string; upage?: string }>;
}) {
  const currentUserId = await requireUser();
  const params = await searchParams;

  const currentUser = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 10) {
    redirect("/dashboard");
  }

  const rangeIds = ACTIVITY_LEDGER_RANGES.map((item) => item.id as string);
  const range = (rangeIds.includes(params.range ?? "") ? params.range : "30d") as ActivityLedgerRange;

  const [days, activityTotals, userRows] = await Promise.all([
    listActivityLedgerDays(range),
    listActivityLedgerActivityTotals(range),
    listActivityLedgerUsers(range),
  ]);
  const totals = sumActivityLedger(days);
  const net = totals.income - totals.expense;

  const totalPages = Math.max(1, Math.ceil(days.length / ACTIVITY_LEDGER_PAGE_DAYS));
  const rawPage = Math.trunc(Number(params.page ?? "1"));
  const page = Number.isFinite(rawPage) ? Math.min(totalPages, Math.max(1, rawPage)) : 1;
  const pageDays = days.slice((page - 1) * ACTIVITY_LEDGER_PAGE_DAYS, page * ACTIVITY_LEDGER_PAGE_DAYS);

  const userTotalPages = Math.max(1, Math.ceil(userRows.length / USERS_PER_PAGE));
  const rawUpage = Math.trunc(Number(params.upage ?? "1"));
  const upage = Number.isFinite(rawUpage) ? Math.min(userTotalPages, Math.max(1, rawUpage)) : 1;
  const pageUsers = userRows.slice((upage - 1) * USERS_PER_PAGE, upage * USERS_PER_PAGE);
  const activeUsers = userRows.filter((row) => row.income > 0).length;

  return (
    <>
      <PageHeader
        title="活动记录"
        description="六种限时活动按天汇总的站点收支 · 含各活动本期合计与用户维度"
      />

      <PageBody className="space-y-4">
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">站点收支</CardTitle>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {ACTIVITY_LEDGER_RANGES.map((tab) => (
                <a
                  key={tab.id}
                  href={`/admin/activity${tab.id === "30d" ? "" : `?range=${tab.id}`}`}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    range === tab.id
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </a>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric
                label="站点收入"
                value={`${formatCredits(totals.income)} cr`}
                tone="text-success"
                hint="买券 / 礼包实付 + 倒扣"
              />
              <Metric
                label="站点支出"
                value={`${formatCredits(totals.expense)} cr`}
                tone="text-destructive"
                hint="活动发奖 + 礼包赠送 tcr"
              />
              <Metric
                label="净收益"
                value={`${signed(net, null)} cr`}
                tone={net >= 0 ? "text-success" : "text-destructive"}
                hint="收入 − 支出"
              />
              <Metric label="有账天数" value={`${days.length} 天`} hint={`共 ${totals.entries} 笔流水`} />
            </div>

            <p className="text-xs text-muted-foreground">
              口径：收入 = 用户为活动券 / 礼包实付的 cr 与转盘倒扣；支出 = 活动发放（转盘、翻牌、雷电的
              cr，试炼、工坊、图鉴的 tcr，以及礼包赠送 tcr）。tcr 按 cr 面值计，到期作废不回冲；
              礼包让利（券面 − 实付）不是现金流水，不计入本表。兑换 / 礼包流水按描述里的活动名归属，
              识别不到的落在「未归属活动券」。
            </p>

            <div className="overflow-x-auto">
              <p className="mb-2 text-sm font-medium">各活动本期收支</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2 font-medium">活动</th>
                    <th className="py-2 text-right font-medium">收入</th>
                    <th className="py-2 text-right font-medium">支出</th>
                    <th className="py-2 text-right font-medium">净额</th>
                    <th className="py-2 text-right font-medium">参与人数</th>
                    <th className="py-2 text-right font-medium">笔数</th>
                  </tr>
                </thead>
                <tbody>
                  {activityTotals.length === 0 ? (
                    <tr className="border-t border-border/60">
                      <td colSpan={6} className="py-3 text-sm text-muted-foreground">
                        该时间段还没有活动收支。
                      </td>
                    </tr>
                  ) : (
                    activityTotals.map((row) => <ActivityTotalRow key={row.key} row={row} />)
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-sm font-medium">按天明细</p>

            {days.length === 0 ? (
              <p className="text-sm text-muted-foreground">该时间段还没有活动收支。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-2 font-medium">日期</th>
                      <th className="py-2 font-medium">活动</th>
                      <th className="py-2 text-right font-medium">收入</th>
                      <th className="py-2 text-right font-medium">支出</th>
                      <th className="py-2 text-right font-medium">净额</th>
                      <th className="py-2 text-right font-medium">笔数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageDays.map((day) => (
                      <Fragment key={day.date}>
                        <DayRows day={day} />
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Pagination
              page={page}
              totalPages={totalPages}
              basePath="/admin/activity"
              params={{ range }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">用户收支</CardTitle>
            <span className="text-xs text-muted-foreground">
              窗口内 {userRows.length} 人参与，其中 {activeUsers} 人买过活动券 / 礼包
            </span>
          </CardHeader>
          <CardContent className="space-y-3">
            {userRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">该时间段还没有用户流水。</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-2 font-medium">用户</th>
                        <th className="py-2 font-medium">参与活动（付入 / 领出）</th>
                        <th className="py-2 text-right font-medium">付入</th>
                        <th className="py-2 text-right font-medium">领出</th>
                        <th className="py-2 text-right font-medium">净额</th>
                        <th className="py-2 text-right font-medium">笔数</th>
                      </tr>
                    </thead>
                    <tbody>
                      <UserRows rows={pageUsers} />
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  「付入」是用户为活动券 / 礼包花的 cr，「领出」是活动发给他的 cr / tcr 面值，
                  tcr 到期作废不回收。按付入 + 领出倒序排列。
                </p>
                <Pagination
                  page={upage}
                  totalPages={userTotalPages}
                  basePath="/admin/activity"
                  pageParam="upage"
                  params={{ range, ...(page > 1 ? { page: String(page) } : {}) }}
                />
              </>
            )}
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
