import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db/d1-http";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, getUserTotalBalance } from "@/lib/usage/meter";
import {
  getUsageSummary,
  getUsageTrend,
  getLifetimeUsage,
  getUsageByModel,
  getUsageByChannel,
  type UsageWindow,
} from "@/lib/usage/queries";
import {
  getAnnouncements,
  getFaq,
  getUptimeConfig,
} from "@/lib/settings/dashboard-info";
import { formatCredits, creditsToUsd, getCreditsPerUsd } from "@/lib/billing/credits";
import { calculateDisplayBalance } from "@/lib/billing/display-balance";
import {
  cnBucketKeys,
  cnGreeting,
  cnLastNDaysStart,
  cnStartOfTomorrow,
  elapsedMinutesInWindow,
  formatCnWallClock,
  parseCnWallClock,
  type BucketGranularity,
} from "@/lib/date";
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
import { DashboardToolbar } from "@/components/dashboard/dashboard-toolbar";
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

/** 自定义时段最长 92 天，超过则退回预设，避免一次拉出过大的聚合。 */
const MAX_CUSTOM_SPAN_MS = 92 * 86_400_000;
/** 小时粒度下的桶数上限，超过自动降为天粒度。 */
const MAX_BUCKETS = 744;

interface ResolvedWindow {
  win: UsageWindow;
  keys: string[];
  granularity: BucketGranularity;
  label: string;
  custom: boolean;
  /** 命中的预设档位；自定义时段时为 null（三个预设按钮都不高亮） */
  rangeKey: RangeKey | null;
  /** 回填搜索表单用（`YYYY-MM-DDTHH:mm`） */
  fromInput: string;
  toInput: string;
}

/**
 * 把 searchParams 解析成统计窗口：预设（今日/近 7 日/近 30 日）或自定义起止。
 * 自定义参数非法（缺失、倒置、超 92 天）时静默退回今日，不让看板白屏。
 */
function resolveWindow(params: {
  range?: string;
  from?: string;
  to?: string;
  gran?: string;
}): ResolvedWindow {
  const fallbackGranularity: BucketGranularity = params.gran === "day" ? "day" : "hour";
  const fromMs = params.from ? parseCnWallClock(params.from) : null;
  const toMs = params.to ? parseCnWallClock(params.to) : null;

  if (fromMs !== null && toMs !== null && toMs > fromMs && toMs - fromMs <= MAX_CUSTOM_SPAN_MS) {
    const granularity: BucketGranularity =
      cnBucketKeys(fromMs, toMs, fallbackGranularity).length > MAX_BUCKETS ? "day" : fallbackGranularity;
    return {
      win: { start: new Date(fromMs), end: new Date(toMs) },
      keys: cnBucketKeys(fromMs, toMs, granularity),
      granularity,
      label: `${formatCnWallClock(fromMs)} ~ ${formatCnWallClock(toMs)} · 按${
        granularity === "hour" ? "小时" : "天"
      }`,
      custom: true,
      rangeKey: null,
      fromInput: params.from!.replace(" ", "T").slice(0, 16),
      toInput: params.to!.replace(" ", "T").slice(0, 16),
    };
  }

  const range: RangeKey =
    params.range === "week" || params.range === "month" ? params.range : "today";
  const start = cnLastNDaysStart(RANGE_DAYS[range]);
  const end = cnStartOfTomorrow();
  const startMs = start.getTime();
  const endMs = end.getTime();
  const granularity: BucketGranularity = range === "today" ? "hour" : "day";
  const now = formatCnWallClock(endMs - 1);

  return {
    win: { start, end },
    keys: cnBucketKeys(startMs, endMs, granularity),
    granularity,
    label: `${RANGE_LABEL[range]} · 截至 ${now}`,
    custom: false,
    rangeKey: range,
    fromInput: formatCnWallClock(startMs).replace(" ", "T"),
    toInput: now.replace(" ", "T"),
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; gran?: string }>;
}) {
  const userId = await requireUser();
  const { win, keys, granularity, label, custom, rangeKey, fromInput, toInput } = resolveWindow(
    await searchParams,
  );

  // 使用 try-catch 包裹每个查询，防止单个查询失败导致整个页面崩溃
  const [
    me,
    summary,
    lifetime,
    balanceInfo,
    ratio,
    trend,
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
    getUsageSummary(userId, win).catch(() => ({
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
    getUsageTrend(userId, win, granularity).catch(() => []),
    getUsageByModel(userId, win, "calls").catch(() => []),
    getUsageByChannel(userId, win).catch(() => []),
    getAnnouncements().catch(() => []),
    getFaq().catch(() => []),
    getUptimeConfig().catch(() => ({ enabled: false, apiUrl: "" })),
  ]);

  const balance = balanceInfo.total;
  const displayBalance = calculateDisplayBalance(balanceInfo.permanent, balanceInfo.temporary);
  const totalTokens = (summary.totalInputTokens || 0) + (summary.totalOutputTokens || 0);
  const elapsedMinutes = elapsedMinutesInWindow(win.start, win.end);

  const series: AnalyticsPoint[] = keys.map((key) => {
    const row = trend.find((x) => x.bucket === key);
    return {
      // 轴标签省掉年份：按天留 MM-DD，按小时留 MM-DD HH:00
      label: key.length === 10 ? key.slice(5) : key.slice(5, 16),
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
      sub: custom ? "自定义时段内" : "当前时间窗口内",
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
      sub: `窗口已计入 ${Math.round(elapsedMinutes)} 分钟`,
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
      {/* 问候头部 + 时间范围切换 + 搜索/刷新 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-8 py-5">
        <h1 className="text-xl font-semibold">
          👋 {cnGreeting()}，{me[0]?.name?.trim() || me[0]?.email?.split("@")[0] || "朋友"}
        </h1>
        <div className="flex items-center gap-2">
          <div className="flex gap-2">
            {RANGE_OPTIONS.map((opt) => (
              <a
                key={opt.key}
                href={`?range=${opt.key}`}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  opt.key === rangeKey
                    ? "bg-primary text-white"
                    : "border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </a>
            ))}
          </div>
          <DashboardToolbar custom={custom} from={fromInput} to={toInput} gran={granularity} />
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
          rangeLabel={`${label} · 时区 Asia/Shanghai`}
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
