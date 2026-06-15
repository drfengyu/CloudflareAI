import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/usage/meter";
import {
  getTodayUsage,
  getMonthUsage,
  getUserBalance,
  getRecentUsage,
  getDailyUsage,
  getUsageByModel,
  getHourlyUsageToday,
} from "@/lib/usage/queries";
import { Activity, Wallet, TrendingUp, Clock } from "lucide-react";
import { UsageTrendChart } from "@/components/dashboard/usage-trend-chart";
import { ModelDistributionChart } from "@/components/dashboard/model-distribution-chart";
import { HourlyUsageChart } from "@/components/dashboard/hourly-usage-chart";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const userId = await requireUser();
  const params = await searchParams;
  const range = params.range || "today"; // today | week | month

  // 使用 try-catch 包裹每个查询，防止单个查询失败导致整个页面崩溃
  const [today, month, balance, recent, hourlyUsage, dailyUsage, modelUsage] = await Promise.all([
    getTodayUsage(userId).catch(() => ({ totalCalls: 0, totalCredits: 0, totalInputTokens: 0, totalOutputTokens: 0 })),
    getMonthUsage(userId).catch(() => ({ totalCalls: 0, totalCredits: 0, totalInputTokens: 0, totalOutputTokens: 0 })),
    getUserBalance(userId).catch(() => 0),
    getRecentUsage(userId, 10).catch(() => []),
    getHourlyUsageToday(userId).catch(() => []),
    getDailyUsage(userId, range === "month" ? 30 : 7).catch(() => []),
    getUsageByModel(userId, 30).catch(() => []),
  ]);

  const todayUsd = today.totalCredits / 100; // 100 credits = $1
  const balanceUsd = balance / 100;

  return (
    <>
      <PageHeader
        title="数据看板"
        description="Credits 消耗统计、余额、调用记录"
      />
      <div className="space-y-6 p-8">
        {/* 核心指标卡片 */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Wallet className="h-5 w-5" />}
            label="当前余额"
            value={`${balance.toLocaleString()} credits`}
            subtitle={`≈ $${balanceUsd.toFixed(2)}`}
            tone="primary"
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="今日消耗"
            value={`${Math.round(today.totalCredits).toLocaleString()} credits`}
            subtitle={`≈ $${todayUsd.toFixed(4)}`}
            tone={today.totalCredits > balance * 0.1 ? "warning" : "success"}
          />
          <StatCard
            icon={<Activity className="h-5 w-5" />}
            label="今日调用"
            value={today.totalCalls}
            tone="muted"
          />
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            label="本月调用"
            value={month.totalCalls}
            subtitle={`${Math.round(month.totalCredits).toLocaleString()} credits`}
            tone="muted"
          />
        </div>

        {/* 余额警示 */}
        {balance < 1000 && (
          <Card className="border-warning bg-warning/5">
            <CardContent className="pt-5">
              <p className="text-sm text-warning">
                ⚠️ 余额不足 1000 credits（$10），请及时充值以免影响使用
              </p>
            </CardContent>
          </Card>
        )}

        {/* 图表区 */}
        <div className="space-y-4">
          {/* 时间范围切换 */}
          <div className="flex gap-2">
            <a
              href="?range=today"
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                range === "today"
                  ? "bg-primary text-white"
                  : "border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              今日
            </a>
            <a
              href="?range=week"
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                range === "week"
                  ? "bg-primary text-white"
                  : "border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              本周
            </a>
            <a
              href="?range=month"
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                range === "month"
                  ? "bg-primary text-white"
                  : "border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              本月
            </a>
          </div>

          {/* 今日小时趋势 */}
          {range === "today" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">今日每小时消耗（0-23时）</CardTitle>
              </CardHeader>
              <CardContent>
                <HourlyUsageChart data={hourlyUsage} />
              </CardContent>
            </Card>
          )}

          {/* 每日趋势 */}
          {range !== "today" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {range === "week" ? "近 7 日" : "近 30 日"}消耗趋势
                </CardTitle>
              </CardHeader>
              <CardContent>
                <UsageTrendChart data={dailyUsage} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* 模型分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">近 30 日模型分布（Top 10）</CardTitle>
          </CardHeader>
          <CardContent>
            <ModelDistributionChart data={modelUsage} />
          </CardContent>
        </Card>

        {/* 最近调用记录 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">最近 10 次调用</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无调用记录</p>
            ) : (
              <div className="space-y-2">
                {recent.map((log) => {
                  const channelLabel =
                    log.channel === "web" ? "站内" :
                    log.channel === "openai" ? "OpenAI" :
                    log.channel === "anthropic" ? "Anthropic" :
                    log.channel;

                  return (
                    <div
                      key={log.id}
                      className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface p-3 text-xs"
                    >
                      {/* 左侧：状态 + 渠道 */}
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge tone={log.status === "ok" ? "success" : "danger"}>
                          {log.status}
                        </Badge>
                        <Badge tone="muted">{channelLabel}</Badge>
                      </div>

                      {/* 中间：Key + 模型 + 错误 */}
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        {log.apiKeyName ? (
                          <Badge tone="muted">🔑 {log.apiKeyName}</Badge>
                        ) : (
                          <Badge tone="muted">历史数据</Badge>
                        )}
                        <span className="max-w-[200px] truncate font-mono text-[11px] text-muted-foreground" title={log.model}>
                          {log.model}
                        </span>
                        {log.status === "error" && log.errorReason && (
                          <span className="text-xs text-danger truncate max-w-[150px]" title={log.errorReason}>
                            ⚠️ {log.errorReason}
                          </span>
                        )}
                      </div>

                      {/* 右侧：指标 */}
                      <div className="flex items-center gap-3 text-muted-foreground whitespace-nowrap">
                        <span className="font-medium w-[60px] text-right">
                          {log.creditsUsed ? `${Math.round(log.creditsUsed)} cr` : "—"}
                        </span>
                        <span className="w-[50px] text-right">{log.latencyMs ? `${(log.latencyMs / 1000).toFixed(2)}s` : "—"}</span>
                        <span className="text-[11px] w-[80px] text-right">
                          {new Date(log.createdAt!).toLocaleString("zh-CN", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtitle,
  tone = "muted",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  tone?: "primary" | "warning" | "danger" | "success" | "muted";
}) {
  const colors = {
    primary: "text-primary",
    warning: "text-warning",
    danger: "text-danger",
    success: "text-success",
    muted: "text-muted-foreground",
  };

  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5">
        <div className={colors[tone]}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-semibold">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
