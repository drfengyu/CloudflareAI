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
  listActivityLedgerDays,
  sumActivityLedger,
  type ActivityLedgerDay,
  type ActivityLedgerRange,
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

export default async function AdminActivityLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; page?: string }>;
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

  const days = await listActivityLedgerDays(range);
  const totals = sumActivityLedger(days);
  const net = totals.income - totals.expense;

  const totalPages = Math.max(1, Math.ceil(days.length / ACTIVITY_LEDGER_PAGE_DAYS));
  const rawPage = Math.trunc(Number(params.page ?? "1"));
  const page = Number.isFinite(rawPage) ? Math.min(totalPages, Math.max(1, rawPage)) : 1;
  const pageDays = days.slice((page - 1) * ACTIVITY_LEDGER_PAGE_DAYS, page * ACTIVITY_LEDGER_PAGE_DAYS);

  return (
    <>
      <PageHeader
        title="活动记录"
        description="六种限时活动按天汇总的站点收支 · 只保留每日小计，不列逐笔明细"
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
      </PageBody>
    </>
  );
}
