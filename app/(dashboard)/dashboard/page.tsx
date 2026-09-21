import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser, getUserTotalBalance } from "@/lib/usage/meter";
import {
  getTodayUsage,
  getMonthUsage,
  getDailyUsage,
  getUsageByModel,
  getUsageByChannel,
  getHourlyUsageToday,
} from "@/lib/usage/queries";
import {
  getAnnouncements,
  getFaq,
  getUptimeConfig,
} from "@/lib/settings/dashboard-info";
import { formatCredits, creditsToUsd, getCreditsPerUsd } from "@/lib/billing/credits";
import { calculateDisplayBalance } from "@/lib/billing/display-balance";
import { Activity, Wallet, TrendingUp, Clock } from "lucide-react";
import { UsageTrendChart } from "@/components/dashboard/usage-trend-chart";
import { ModelDistributionChart } from "@/components/dashboard/model-distribution-chart";
import { HourlyUsageChart } from "@/components/dashboard/hourly-usage-chart";
import { AnnouncementCard } from "@/components/dashboard/announcement-card";
import { FaqCard } from "@/components/dashboard/faq-card";
import { UptimeCard } from "@/components/dashboard/uptime-card";
import { PieChart } from "@/components/charts/pie-chart";

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
  const [today, month, balanceInfo, hourlyUsage, dailyUsage, modelUsage, channelUsage, ratio, announcements, faq, uptimeConfig] = await Promise.all([
    getTodayUsage(userId).catch(() => ({ totalCalls: 0, totalCredits: 0, totalInputTokens: 0, totalOutputTokens: 0 })),
    getMonthUsage(userId).catch(() => ({ totalCalls: 0, totalCredits: 0, totalInputTokens: 0, totalOutputTokens: 0 })),
    getUserTotalBalance(userId).catch(() => ({ permanent: 0, temporary: 0, total: 0 })),
    getHourlyUsageToday(userId).catch(() => []),
    getDailyUsage(userId, range === "month" ? 30 : 7).catch(() => []),
    getUsageByModel(userId, range === "today" ? 1 : range === "week" ? 7 : 30).catch(() => []),
    getUsageByChannel(userId, range === "today" ? 1 : range === "week" ? 7 : 30).catch(() => []),
    getCreditsPerUsd().catch(() => 1),
    getAnnouncements().catch(() => []),
    getFaq().catch(() => []),
    getUptimeConfig().catch(() => ({ enabled: false, apiUrl: "" })),
  ]);

  const balance = balanceInfo.total; // 总余额（永久+临时）
  const todayUsd = creditsToUsd(today.totalCredits, ratio);
  const balanceUsd = creditsToUsd(balance, ratio);

  // 计算显示用余额（负数补正）
  const displayBalance = calculateDisplayBalance(balanceInfo.permanent, balanceInfo.temporary);

  return (
    <>
      <PageHeader
        title="数据看板"
        description="Credits 消耗统计、余额、系统公告与服务可用性"
      />
      <div className="space-y-6 p-8">
        {/* 核心指标卡片 */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Wallet className="h-5 w-5" />}
            label="当前余额"
            value={`${formatCredits(balance)} cr`}
            subtitle={
              balanceInfo.temporary > 0 || balanceInfo.permanent < 0
                ? `≈ $${balanceUsd.toFixed(2)} · 永久 ${formatCredits(displayBalance.displayPermanent)} + 临时 ${formatCredits(displayBalance.displayTemporary)}`
                : `≈ $${balanceUsd.toFixed(2)}`
            }
            tone="primary"
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="今日消耗"
            value={`${formatCredits(today.totalCredits)} cr`}
            subtitle={`≈ $${todayUsd.toFixed(4)}`}
            tone={today.totalCredits > balance * 0.1 ? "warning" : "success"}
          />
          <StatCard
            icon={<Activity className="h-5 w-5" />}
            label="今日调用"
            value={today.totalCalls}
            subtitle={`输入 ${(today.totalInputTokens || 0).toLocaleString()} / 输出 ${(today.totalOutputTokens || 0).toLocaleString()}`}
            tone="muted"
          />
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            label="本月调用"
            value={month.totalCalls}
            subtitle={`${formatCredits(month.totalCredits)} cr · 输入 ${(month.totalInputTokens || 0).toLocaleString()} / 输出 ${(month.totalOutputTokens || 0).toLocaleString()}`}
            tone="muted"
          />
        </div>

        {/* 余额警示 */}
        {balance < 1 && (
          <Card className="border-warning bg-warning/5">
            <CardContent className="pt-5">
              <p className="text-sm text-warning">
                ⚠️ 余额不足 $1，请及时充值以免影响使用
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
              近 7 日
            </a>
            <a
              href="?range=month"
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                range === "month"
                  ? "bg-primary text-white"
                  : "border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              近 30 日
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
            <CardTitle className="text-base">
              {range === "today" ? "今日" : range === "week" ? "近 7 日" : "近 30 日"}模型分布（Top 10）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ModelDistributionChart data={modelUsage} />
          </CardContent>
        </Card>

        {/* 渠道分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {range === "today" ? "今日" : range === "week" ? "近 7 日" : "近 30 日"}渠道分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PieChart
              data={channelUsage}
              dataKey="credits"
              nameKey="name"
              emptyMessage="暂无渠道数据"
            />
          </CardContent>
        </Card>

        {/* 系统公告 / 常见问答 / 服务可用性 */}
        <div className="grid gap-4 lg:grid-cols-4">
          <AnnouncementCard items={announcements} className="lg:col-span-2" />
          <FaqCard items={faq} />
          <UptimeCard configured={uptimeConfig.enabled && !!uptimeConfig.apiUrl} />
        </div>
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
    danger: "text-destructive",
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
