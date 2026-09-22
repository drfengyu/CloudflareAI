import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db/d1-http";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, getUserTotalBalance } from "@/lib/usage/meter";
import {
  getUsageSummary,
  getLifetimeUsage,
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
import { cnGreeting, cnLastNDaysStart, elapsedMinutesSince, formatCnWallClock } from "@/lib/date";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  Coins,
  Gauge,
  Hash,
  Timer,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { StatGroupCard, type StatItem } from "@/components/dashboard/stat-group-card";
import { ModelAnalyticsCard, type AnalyticsPoint } from "@/components/dashboard/model-analytics-card";
import { AnnouncementCard } from "@/components/dashboard/announcement-card";
import { FaqCard } from "@/components/dashboard/faq-card";
import { UptimeCard } from "@/components/dashboard/uptime-card";

export const dynamic = "force-dynamic";

const RANGE_DAYS = { today: 1, week: 7, month: 30 } as const;
type RangeKey = keyof typeof RANGE_DAYS;

const RANGE_LABEL: Record<RangeKey, string> = {
  today: "今日",
  week: "近 7 日",
  month: "近 30 日",
};

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "week", label: "近 7 日" },
  { key: "month", label: "近 30 日" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const userId = await requireUser();
  const params = await searchParams;
  const range: RangeKey =
    params.range === "week" || params.range === "month" ? params.range : "today";
  const days = RANGE_DAYS[range];
  const windowStart = cnLastNDaysStart(days);

  // 使用 try-catch 包裹每个查询，防止单个查询失败导致整个页面崩溃
  const [
    me,
    summary,
    lifetime,
    balanceInfo,
    ratio,
    hourly,
    daily,
    modelCalls,
    channelUsage,
    announcements,
    faq,
    uptimeConfig,
  ] = await Promise.all([
    db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .catch(() => []),
    getUsageSummary(userId, windowStart).catch(() => ({
      totalCalls: 0,
      successCalls: 0,
      errorCalls: 0,
      totalCredits: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      avgLatencyMs: null,
    })),
    getLifetimeUsage(userId).catch(() => ({ totalCalls: 0, totalCredits: 0 })),
    getUserTotalBalance(userId).catch(() => ({ permanent: 0, temporary: 0, total: 0 })),
    getCreditsPerUsd().catch(() => 1),
    range === "today"
      ? getHourlyUsageToday(userId).catch(() => [])
      : Promise.resolve([]),
    range === "today" ? Promise.resolve([]) : getDailyUsage(userId, days).catch(() => []),
    getUsageByModel(userId, days, "calls").catch(() => []),
    getUsageByChannel(userId, days).catch(() => []),
    getAnnouncements().catch(() => []),
    getFaq().catch(() => []),
    getUptimeConfig().catch(() => ({ enabled: false, apiUrl: "" })),
  ]);

  const balance = balanceInfo.total;
  const displayBalance = calculateDisplayBalance(balanceInfo.permanent, balanceInfo.temporary);
  const totalTokens = (summary.totalInputTokens || 0) + (summary.totalOutputTokens || 0);
  // 窗口是「含今天在内的 N 个日历日」，尚未过完的部分不该摊薄均值，故按已流逝分钟数计。
  const elapsedMinutes = elapsedMinutesSince(windowStart);

  const series: AnalyticsPoint[] =
    range === "today"
      ? Array.from({ length: 24 }, (_, h) => {
          const row = hourly.find((x) => x.hour === h);
          return {
            label: `${String(h).padStart(2, "0")}:00`,
            credits: row?.credits ?? 0,
            calls: row?.calls ?? 0,
          };
        })
      : Array.from({ length: days }, (_, i) => {
          const dayStart = formatCnWallClock(cnLastNDaysStart(days - i), false);
          const row = daily.find((x) => x.date === dayStart);
          return {
            label: dayStart.slice(5),
            credits: row?.credits ?? 0,
            calls: row?.calls ?? 0,
          };
        });

  const accountItems: StatItem[] = [
    {
      icon: <Wallet className="h-4 w-4" />,
      tone: "info",
      label: "当前余额",
      value: `${formatCredits(balance)} cr`,
      sub: `≈ $${creditsToUsd(balance, ratio).toFixed(2)}${
        balanceInfo.temporary > 0 || balanceInfo.permanent < 0
          ? ` · 永久 ${formatCredits(displayBalance.displayPermanent)} + 临时 ${formatCredits(displayBalance.displayTemporary)}`
          : ""
      }`,
      href: "/wallet",
      actionLabel: "充值",
    },
    {
      icon: <TrendingUp className="h-4 w-4" />,
      tone: "warning",
      label: "历史消耗",
      value: `$${creditsToUsd(lifetime.totalCredits, ratio).toFixed(2)}`,
      sub: `累计 ${lifetime.totalCalls.toLocaleString()} 次调用`,
    },
  ];

  const usageItems: StatItem[] = [
    {
      icon: <Hash className="h-4 w-4" />,
      tone: "success",
      label: "请求次数",
      value: summary.totalCalls.toLocaleString(),
      sub: `${RANGE_LABEL[range]}窗口内`,
    },
    {
      icon: <CheckCircle2 className="h-4 w-4" />,
      tone: summary.errorCalls > 0 ? "danger" : "muted",
      label: "成功 / 失败",
      value: `${summary.successCalls.toLocaleString()} / ${summary.errorCalls.toLocaleString()}`,
      sub:
        summary.totalCalls > 0
          ? `成功率 ${((summary.successCalls / summary.totalCalls) * 100).toFixed(1)}%`
          : "暂无调用",
    },
  ];

  const resourceItems: StatItem[] = [
    {
      icon: <Coins className="h-4 w-4" />,
      tone: "warning",
      label: "统计额度",
      value: `${formatCredits(summary.totalCredits)} cr`,
      sub: `≈ $${creditsToUsd(summary.totalCredits, ratio).toFixed(4)}`,
    },
    {
      icon: <Zap className="h-4 w-4" />,
      tone: "info",
      label: "统计 Tokens",
      value: totalTokens.toLocaleString(),
      sub: `输入 ${(summary.totalInputTokens || 0).toLocaleString()} / 输出 ${(summary.totalOutputTokens || 0).toLocaleString()}`,
    },
  ];

  const perfItems: StatItem[] = [
    {
      icon: <Activity className="h-4 w-4" />,
      tone: "primary",
      label: "平均 RPM",
      value: formatRate(summary.totalCalls / elapsedMinutes),
      sub: `窗口已流逝 ${Math.round(elapsedMinutes)} 分钟`,
    },
    {
      icon: <Gauge className="h-4 w-4" />,
      tone: "success",
      label: "平均 TPM",
      value: formatRate(totalTokens / elapsedMinutes),
      sub:
        summary.avgLatencyMs && summary.avgLatencyMs > 0
          ? `平均延迟 ${Math.round(summary.avgLatencyMs).toLocaleString()} ms`
          : "平均延迟 —",
    },
  ];

  return (
    <>
      {/* 问候头部 + 时间范围切换 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-8 py-5">
        <h1 className="text-xl font-semibold">
          👋 {cnGreeting()}，{me[0]?.name?.trim() || me[0]?.email?.split("@")[0] || "朋友"}
        </h1>
        <div className="flex gap-2">
          {RANGE_OPTIONS.map((opt) => (
            <a
              key={opt.key}
              href={`?range=${opt.key}`}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                range === opt.key
                  ? "bg-primary text-white"
                  : "border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </a>
          ))}
        </div>
      </div>

      <div className="space-y-6 p-8">
        {/* 四组核心指标 */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatGroupCard icon={<BarChart3 className="h-4 w-4" />} title="账户数据" items={accountItems} />
          <StatGroupCard icon={<Activity className="h-4 w-4" />} title="使用统计" items={usageItems} />
          <StatGroupCard icon={<Clock className="h-4 w-4" />} title="资源消耗" items={resourceItems} />
          <StatGroupCard icon={<Timer className="h-4 w-4" />} title="性能指标" items={perfItems} />
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

        {/* 模型数据分析（消耗分布 / 调用趋势 / 次数分布 / 排行 / 渠道） */}
        <ModelAnalyticsCard
          rangeLabel={`${RANGE_LABEL[range]} · 时区 Asia/Shanghai`}
          series={series}
          models={modelCalls}
          channels={channelUsage}
          totalCalls={summary.totalCalls}
        />

        {/* 系统公告 / 常见问答 / 服务可用性 */}
        <div className="grid gap-4 lg:grid-cols-4">
          <AnnouncementCard items={announcements} className="lg:col-span-2" />
          <FaqCard items={faq} />
          <UptimeCard enabled={uptimeConfig.enabled} />
        </div>
      </div>
    </>
  );
}

/** 速率类指标：小于 100 时保留三位小数，否则取整，避免出现「0.0000012」。 */
function formatRate(value: number) {
  return value >= 100 ? Math.round(value).toLocaleString() : value.toFixed(3);
}
