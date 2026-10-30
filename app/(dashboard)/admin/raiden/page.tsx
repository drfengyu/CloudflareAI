import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db/d1-http";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { redirect } from "next/navigation";
import { formatCredits } from "@/lib/billing/credits";
import {
  cnLastNDaysStart,
  cnStartOfToday,
  cnStartOfTomorrow,
  formatCnWallClock,
} from "@/lib/date";
import {
  RAIDEN_STAGES,
  raidenActivityKey,
  raidenActivityWindow,
} from "@/lib/raiden/config";
import { getRaidenConfig } from "@/lib/raiden/settings";
import {
  getAdminRaidenReport,
  listRaidenLeaderboard,
  runStatusLabel,
} from "@/lib/raiden/records";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const RANGE_TABS: { value: string; label: string }[] = [
  { value: "today", label: "今日" },
  { value: "7d", label: "近 7 日" },
  { value: "30d", label: "近 30 日" },
  { value: "all", label: "全部" },
];

/** 时间窗按北京时间算，与转盘记录页一致。 */
function resolveWindow(range: string): { start: Date; end: Date } {
  const end = cnStartOfTomorrow();
  if (range === "today") return { start: cnStartOfToday(), end };
  if (range === "7d") return { start: cnLastNDaysStart(7), end };
  if (range === "30d") return { start: cnLastNDaysStart(30), end };
  return { start: new Date(0), end };
}

const STATUS_TONE: Record<string, "success" | "danger" | "muted" | "info"> = {
  cleared: "success",
  failed: "danger",
  abandoned: "muted",
  active: "info",
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

export default async function AdminRaidenPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const currentUserId = await requireUser();
  const params = await searchParams;

  const currentUser = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 10) {
    redirect("/dashboard");
  }

  const rawRange = params.range ?? "all";
  const range = RANGE_TABS.some((t) => t.value === rawRange) ? rawRange : "all";
  const win = resolveWindow(range);

  const config = await getRaidenConfig();
  const activity = raidenActivityWindow(config);
  const activityKey = raidenActivityKey(config);

  const [report, leaderboard] = activityKey
    ? await Promise.all([
        getAdminRaidenReport(activityKey, win.start, win.end),
        listRaidenLeaderboard(activityKey, currentUserId, 10),
      ])
    : [null, []];

  const net = report ? Number((report.spentCredits - report.rewardsPaid).toFixed(2)) : 0;

  return (
    <>
      <PageHeader
        title="雷电记录"
        description="限时活动 · 纵版射击的装备消耗与通关奖励"
      />

      <div className="space-y-6 p-8">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              收益概览
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {activity.status === "disabled"
                  ? "活动当前未开启"
                  : `${activity.status === "active" ? "进行中" : activity.status === "pending" ? "未开始" : "已结束"} · ${config.startAt || "—"} ~ ${config.endAt || "—"} · 每日 ${config.dailyRuns} 次 · 复活 ${formatCredits(config.revivePriceCredits)} cr/次`}
              </span>
            </CardTitle>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {RANGE_TABS.map((tab) => (
                <a
                  key={tab.value}
                  href={`/admin/raiden${tab.value === "all" ? "" : `?range=${tab.value}`}`}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    range === tab.value
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </a>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!report || !activityKey ? (
              <p className="text-sm text-muted-foreground">
                活动未开启或未设置开始时间，暂无记录。开启后这里会按活动轮次统计出击、
                装备消耗与奖励发放。
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <Metric
                    label="站点净收益"
                    value={`${formatCredits(net)} cr`}
                    tone={net >= 0 ? "positive" : "negative"}
                    hint="装备/复活消耗 − 通关奖励"
                  />
                  <Metric
                    label="装备消耗"
                    value={`${formatCredits(report.spentCredits)} cr`}
                    hint="购买装备 + 付费复活"
                  />
                  <Metric
                    label="奖励发放"
                    value={`${formatCredits(report.rewardsPaid)} cr`}
                    tone="negative"
                    hint="计入临时余额"
                  />
                  <Metric
                    label="出击次数"
                    value={`${report.runs}`}
                    hint={`${report.players} 位玩家参与`}
                  />
                  <Metric
                    label="首通 / 重复"
                    value={`${report.firstClears} / ${report.repeatClears}`}
                    hint={`重复奖励每日封顶 ${formatCredits(config.repeatDailyCap)} cr`}
                  />
                  <Metric
                    label="奖励有效期"
                    value={`${config.rewardValidDays} 天`}
                    hint={`满配装备 ${formatCredits(
                      config.items.weapon.price * config.items.weapon.max +
                        config.items.bomb.price * config.items.bomb.max +
                        config.items.shield.price +
                        config.items.life.price * config.items.life.max,
                    )} cr`}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  统计范围是当前活动轮次（以开始时间区分），下一轮活动会从零重新统计。
                  奖励全部发放到临时余额，过期未使用不会实际付出；这里的净值是 cr 口径，
                  不代表真实资金。
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {report && activityKey && (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">关卡数据</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-secondary/50 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">关卡</th>
                          <th className="px-3 py-2 font-medium">通关</th>
                          <th className="px-3 py-2 font-medium">首通</th>
                          <th className="px-3 py-2 font-medium">奖励</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {report.stages.map((row) => (
                          <tr key={row.stageNo} className="hover:bg-secondary/30">
                            <td className="px-3 py-2">
                              {row.stageNo}. {row.name}
                            </td>
                            <td className="px-3 py-2 tabular-nums">{row.clears}</td>
                            <td className="px-3 py-2 tabular-nums">{row.firstClears}</td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatCredits(row.rewards)} cr
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    第 {RAIDEN_STAGES.length} 关通关即全关通关；首通每人每轮每关只发一次。
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    活动排行榜
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      当前轮次 · 每人取最高分 · 不受时间筛选影响
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {leaderboard.length === 0 ? (
                    <p className="text-sm text-muted-foreground">本轮还没有上榜记录。</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-secondary/50 text-xs text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 font-medium">#</th>
                            <th className="px-3 py-2 font-medium">玩家</th>
                            <th className="px-3 py-2 font-medium">最高分</th>
                            <th className="px-3 py-2 font-medium">关卡</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {leaderboard.map((row) => (
                            <tr key={row.userId} className="hover:bg-secondary/30">
                              <td className="px-3 py-2 tabular-nums text-muted-foreground">
                                {row.rank}
                              </td>
                              <td className="px-3 py-2">{row.label}</td>
                              <td className="px-3 py-2 tabular-nums">
                                {row.score.toLocaleString("zh-CN")}
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {row.clearedAll
                                  ? "全关通关"
                                  : row.stage > 0
                                    ? (RAIDEN_STAGES[row.stage - 1]?.code ?? `STAGE ${row.stage}`)
                                    : "未通关"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  最近对局
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    时间窗内最近 {report.recentRuns.length} 局（最多 50 条）
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {report.recentRuns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">该时段没有出击记录。</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-secondary/50 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">开始时间</th>
                          <th className="px-3 py-2 font-medium">玩家</th>
                          <th className="px-3 py-2 font-medium">状态</th>
                          <th className="px-3 py-2 font-medium">关卡</th>
                          <th className="px-3 py-2 font-medium">分数</th>
                          <th className="px-3 py-2 font-medium">消耗</th>
                          <th className="px-3 py-2 font-medium">复活</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {report.recentRuns.map((row) => (
                          <tr key={row.id} className="hover:bg-secondary/30">
                            <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                              {formatCnWallClock(new Date(row.startedAt))}
                            </td>
                            <td className="px-3 py-2">{row.label}</td>
                            <td className="px-3 py-2">
                              <Badge tone={STATUS_TONE[row.status] ?? "muted"}>
                                {runStatusLabel(row.status)}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 tabular-nums">{row.stage || "—"}</td>
                            <td className="px-3 py-2 tabular-nums">
                              {row.score.toLocaleString("zh-CN")}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatCredits(row.creditsSpent)} cr
                            </td>
                            <td className="px-3 py-2 tabular-nums">{row.revives}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
