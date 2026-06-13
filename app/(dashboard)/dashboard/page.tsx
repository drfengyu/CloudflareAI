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
} from "@/lib/usage/queries";
import { Activity, Wallet, TrendingUp, Clock } from "lucide-react";
import { UsageTrendChart } from "@/components/dashboard/usage-trend-chart";
import { ModelDistributionChart } from "@/components/dashboard/model-distribution-chart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await requireUser();

  // 使用 try-catch 包裹每个查询，防止单个查询失败导致整个页面崩溃
  const [today, month, balance, recent, dailyUsage, modelUsage] = await Promise.all([
    getTodayUsage(userId).catch(() => ({ totalCalls: 0, totalCredits: 0, totalInputTokens: 0, totalOutputTokens: 0 })),
    getMonthUsage(userId).catch(() => ({ totalCalls: 0, totalCredits: 0, totalInputTokens: 0, totalOutputTokens: 0 })),
    getUserBalance(userId).catch(() => 0),
    getRecentUsage(userId, 10).catch(() => []),
    getDailyUsage(userId, 7).catch(() => []),
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
        <div className="grid gap-4 lg:grid-cols-2">
          {/* 消耗趋势 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">近 7 日消耗趋势</CardTitle>
            </CardHeader>
            <CardContent>
              <UsageTrendChart data={dailyUsage} />
            </CardContent>
          </Card>

          {/* 模型分布 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">近 30 日模型分布（Top 10）</CardTitle>
            </CardHeader>
            <CardContent>
              <ModelDistributionChart data={modelUsage} />
            </CardContent>
          </Card>
        </div>

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
                {recent.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <Badge tone={log.status === "ok" ? "success" : "danger"}>
                        {log.status}
                      </Badge>
                      <span className="text-muted-foreground">
                        {log.channel === "web" ? "站内" : log.channel}
                      </span>
                      <span className="max-w-[200px] truncate font-mono text-[11px] text-muted-foreground">
                        {log.model}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span className="font-medium">
                        {log.creditsUsed ? `${Math.round(log.creditsUsed)} cr` : "—"}
                      </span>
                      <span>{log.latencyMs ? `${log.latencyMs}ms` : "—"}</span>
                      <span className="text-[11px]">
                        {new Date(log.createdAt!).toLocaleString("zh-CN", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                ))}
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
