import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/usage/meter";
import {
  getTodayUsage,
  getMonthUsage,
  getUserQuota,
  getRecentUsage,
} from "@/lib/usage/queries";
import { Activity, Zap, DollarSign, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await requireUser();
  const [today, month, quota, recent] = await Promise.all([
    getTodayUsage(userId),
    getMonthUsage(userId),
    getUserQuota(userId),
    getRecentUsage(userId, 10),
  ]);

  const todayRemaining = Math.max(0, quota.dailyNeuronLimit - today.totalNeurons);
  const todayPercent = Math.min(
    100,
    (today.totalNeurons / quota.dailyNeuronLimit) * 100,
  );

  return (
    <>
      <PageHeader
        title="用量总览"
        description="今日/本月调用次数、Neuron 消耗与配额余量"
      />
      <div className="space-y-6 p-8">
        {/* 今日用量 */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Activity className="h-5 w-5" />}
            label="今日调用"
            value={today.totalCalls}
            tone="primary"
          />
          <StatCard
            icon={<Zap className="h-5 w-5" />}
            label="今日 Neurons"
            value={Math.round(today.totalNeurons).toLocaleString()}
            subtitle={`剩余 ${Math.round(todayRemaining).toLocaleString()}`}
            tone={todayPercent > 80 ? "danger" : "warning"}
          />
          <StatCard
            icon={<DollarSign className="h-5 w-5" />}
            label="今日费用"
            value={`$${today.totalCost.toFixed(4)}`}
            tone="muted"
          />
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            label="本月调用"
            value={month.totalCalls}
            tone="muted"
          />
        </div>

        {/* 配额进度 */}
        <Card>
          <CardContent className="pt-5">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-muted">每日 Neuron 配额</span>
              <span className="font-medium">
                {Math.round(today.totalNeurons).toLocaleString()} /{" "}
                {quota.dailyNeuronLimit.toLocaleString()}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${todayPercent}%` }}
              />
            </div>
            {todayPercent > 90 && (
              <p className="mt-2 text-xs text-danger">
                ⚠️ 今日配额即将用尽，请注意调用频率
              </p>
            )}
          </CardContent>
        </Card>

        {/* 最近调用 */}
        <Card>
          <CardContent className="pt-5">
            <h3 className="mb-4 text-sm font-medium">最近 10 次调用</h3>
            {recent.length === 0 ? (
              <p className="text-sm text-muted">暂无调用记录</p>
            ) : (
              <div className="space-y-2">
                {recent.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        tone={log.status === "ok" ? "success" : "danger"}
                      >
                        {log.status}
                      </Badge>
                      <span className="text-muted">{log.task}</span>
                      <span className="font-mono text-[11px] text-muted">
                        {log.model}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-muted">
                      <span>{log.latencyMs ? `${log.latencyMs}ms` : "—"}</span>
                      <span>
                        {new Date(log.createdAt!).toLocaleTimeString("zh-CN")}
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
    muted: "text-muted",
  };

  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5">
        <div className={colors[tone]}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">{label}</p>
          <p className="truncate text-lg font-semibold">{value}</p>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
