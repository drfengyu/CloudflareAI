import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageBody } from "@/components/dashboard/section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db/d1-http";
import { users } from "@/lib/db/schema";
import { requireUser } from "@/lib/usage/meter";
import { formatCredits } from "@/lib/billing/credits";
import { cn } from "@/lib/utils";
import {
  listActivityLedgerSections,
  type ActivityLedgerSection,
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

function periodText(section: ActivityLedgerSection): string {
  if (!section.firstDate || !section.lastDate) return "无记录";
  return section.firstDate === section.lastDate
    ? section.firstDate
    : `${section.firstDate} ~ ${section.lastDate}`;
}

function SectionCard({ section }: { section: ActivityLedgerSection }) {
  const net = section.income - section.expense;
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <CardTitle className="text-base">{section.label}</CardTitle>
          <span className="text-xs text-muted-foreground tabular-nums">{periodText(section)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            收入 <span className="text-success tabular-nums">{signed(section.income, "+")}</span>
          </span>
          <span>
            支出 <span className="text-destructive tabular-nums">{signed(-section.expense, "−")}</span>
          </span>
          <span>
            净额 <span className={netTone(net)}>{signed(net, null)}</span>
          </span>
          <span className="tabular-nums">
            {section.users} 人 · {section.entries} 笔
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {section.days.length === 0 ? (
          <p className="text-sm text-muted-foreground">这段时间没有流水。</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium">按天</p>
              <div className="max-h-80 overflow-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-secondary/80 text-left text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">日期</th>
                      <th className="px-2 py-1.5 text-right font-medium">收入</th>
                      <th className="px-2 py-1.5 text-right font-medium">支出</th>
                      <th className="px-2 py-1.5 text-right font-medium">净额</th>
                      <th className="px-2 py-1.5 text-right font-medium">笔数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.days.map((day) => {
                      const dayNet = day.income - day.expense;
                      return (
                        <tr key={day.date} className="border-t border-border/60">
                          <td className="px-2 py-1.5 font-mono">{day.date}</td>
                          <td className="px-2 py-1.5 text-right text-success tabular-nums">
                            {signed(day.income, "+")}
                          </td>
                          <td className="px-2 py-1.5 text-right text-destructive tabular-nums">
                            {signed(-day.expense, "−")}
                          </td>
                          <td className={cn("px-2 py-1.5 text-right", netTone(dayNet))}>
                            {signed(dayNet, null)}
                          </td>
                          <td className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">
                            {day.entries}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">
                按用户小计
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {section.userRows.length} 人，按付入 + 领出倒序
                </span>
              </p>
              <div className="max-h-80 overflow-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-secondary/80 text-left text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">用户</th>
                      <th className="px-2 py-1.5 text-right font-medium">付入</th>
                      <th className="px-2 py-1.5 text-right font-medium">领出</th>
                      <th className="px-2 py-1.5 text-right font-medium">净额</th>
                      <th className="px-2 py-1.5 text-right font-medium">笔数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.userRows.map((row) => {
                      const rowNet = row.income - row.expense;
                      return (
                        <tr key={row.userId} className="border-t border-border/60">
                          <td className="max-w-[10rem] truncate px-2 py-1.5" title={row.label}>
                            {row.label}
                          </td>
                          <td className="px-2 py-1.5 text-right text-success tabular-nums">
                            {signed(row.income, "+")}
                          </td>
                          <td className="px-2 py-1.5 text-right text-destructive tabular-nums">
                            {signed(-row.expense, "−")}
                          </td>
                          <td className={cn("px-2 py-1.5 text-right", netTone(rowNet))}>
                            {signed(rowNet, null)}
                          </td>
                          <td className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">
                            {row.entries}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-border bg-secondary/40 font-medium">
                      <td className="px-2 py-1.5">小计</td>
                      <td className="px-2 py-1.5 text-right text-success tabular-nums">
                        {signed(section.income, "+")}
                      </td>
                      <td className="px-2 py-1.5 text-right text-destructive tabular-nums">
                        {signed(-section.expense, "−")}
                      </td>
                      <td className={cn("px-2 py-1.5 text-right", netTone(net))}>{signed(net, null)}</td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">
                        {section.entries}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function AdminActivityLedgerPage() {
  const currentUserId = await requireUser();

  const currentUser = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 10) {
    redirect("/dashboard");
  }

  const { sections, totals } = await listActivityLedgerSections();
  const net = totals.income - totals.expense;

  return (
    <>
      <PageHeader
        title="活动记录"
        description="按活动汇总站点收支：各活动时段内按天拆分，并给出用户小计与总计"
      />

      <PageBody className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">站点总计</CardTitle>
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
              <Metric
                label="参与人数"
                value={`${totals.users} 人`}
                hint={`${sections.length} 个活动 · ${totals.entries} 笔流水`}
              />
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">活动</th>
                    <th className="px-3 py-2 font-medium">活动时段</th>
                    <th className="px-3 py-2 text-right font-medium">收入</th>
                    <th className="px-3 py-2 text-right font-medium">支出</th>
                    <th className="px-3 py-2 text-right font-medium">净额</th>
                    <th className="px-3 py-2 text-right font-medium">人数</th>
                    <th className="px-3 py-2 text-right font-medium">笔数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sections.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-4 text-sm text-muted-foreground">
                        还没有任何活动流水。
                      </td>
                    </tr>
                  ) : (
                    sections.map((section) => {
                      const sectionNet = section.income - section.expense;
                      return (
                        <tr key={section.key} className="hover:bg-secondary/30">
                          <td className="px-3 py-2 font-medium">{section.label}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                            {periodText(section)}
                          </td>
                          <td className="px-3 py-2 text-right text-success tabular-nums">
                            {signed(section.income, "+")}
                          </td>
                          <td className="px-3 py-2 text-right text-destructive tabular-nums">
                            {signed(-section.expense, "−")}
                          </td>
                          <td className={cn("px-3 py-2 text-right", netTone(sectionNet))}>
                            {signed(sectionNet, null)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{section.users}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{section.entries}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              口径：收入 = 用户为活动券 / 礼包实付的 cr 与转盘倒扣；支出 = 活动发放（转盘、翻牌、雷电的
              cr，试炼、工坊、图鉴的 tcr，以及礼包赠送 tcr）。tcr 按 cr 面值计，到期作废不回冲；
              礼包让利（券面 − 实付）不是现金流水，不计入本表。兑换 / 礼包流水按描述里的活动名归属，
              识别不到的落在「未归属活动券」。活动时段取该活动实际有账的首末北京日。
            </p>
          </CardContent>
        </Card>

        {sections.map((section) => (
          <SectionCard key={section.key} section={section} />
        ))}
      </PageBody>
    </>
  );
}
