"use client";

import { useState } from "react";
import { AreaChart, BarChart, LineChart, PieChart } from "@/components/charts";
import { Card, CardContent } from "@/components/ui/card";
import { PillTab } from "@/components/dashboard/section";
import { ActivitySpendChart } from "@/components/dashboard/activity-spend-chart";
import type { ActivitySpendPoint } from "@/lib/usage/activity-spend";

// 图表组件的泛型约束是 Record<string, any>，用具名 interface 会缺索引签名，故用 type 别名。
export type AnalyticsPoint = {
  label: string;
  credits: number;
  calls: number;
};

export type AnalyticsModel = {
  model: string;
  calls: number;
  credits: number;
};

export type AnalyticsChannel = {
  name: string;
  calls: number;
  credits: number;
};

const TABS = [
  { key: "credits", label: "消耗分布" },
  { key: "trend", label: "调用趋势" },
  { key: "calls", label: "调用次数分布" },
  { key: "ranking", label: "调用次数排行" },
  { key: "channel", label: "渠道分布" },
  { key: "activity", label: "活动消耗" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** 模型名只留最后一段，完整名放 tooltip / 排行表里。 */
function shortModel(model: string) {
  return model.split("/").pop() || model;
}

/**
 * 模型数据分析：一个卡片内切换六种视角。
 * 数据全部由服务端算好传入，tab 只决定展示形态，不重新请求。
 * 标题交给所在分节（PageSection），这里只留居中药丸切换 + 图形本身。
 */
export function ModelAnalyticsCard({
  series,
  models,
  channels,
  totalCalls,
  activities,
}: {
  series: AnalyticsPoint[];
  /** 按调用次数取的 Top 10 */
  models: AnalyticsModel[];
  channels: AnalyticsChannel[];
  /** 窗口内总调用数，用于排行占比 */
  totalCalls: number;
  /** 同一时间窗内三个限时玩法的消耗 / 收入 / 净收入 */
  activities: ActivitySpendPoint[];
}) {
  const [tab, setTab] = useState<TabKey>("credits");

  // 按小时打点的序列即使没调用也会有整排 0 值，画出来只是一张空网格，这里先折叠成无数据。
  const creditsSeries = series.some((p) => p.credits > 0) ? series : [];
  const callsSeries = series.some((p) => p.calls > 0) ? series : [];
  const channelRows = channels.filter((c) => c.credits > 0);

  const modelBars = models.map((m) => ({
    ...m,
    modelLabel: shortModel(m.model),
  }));

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-5 flex flex-wrap justify-center gap-2">
          {TABS.map((t) => (
            <PillTab key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </PillTab>
          ))}
        </div>

        {tab === "credits" ? (
          <AreaChart
            data={creditsSeries}
            dataKey="credits"
            xAxisKey="label"
            height={280}
            yAxisLabel="Credits"
            emptyMessage="该时段暂无消耗数据"
            tooltipFormatter={(value: number) => [`${Math.round(value)} cr 等值`, "消耗"]}
          />
        ) : null}

        {tab === "trend" ? (
          <LineChart
            data={callsSeries}
            dataKey="calls"
            xAxisKey="label"
            height={280}
            yAxisLabel="次数"
            emptyMessage="该时段暂无调用数据"
            tooltipFormatter={(value: number) => [`${value} 次`, "调用"]}
          />
        ) : null}

        {tab === "calls" ? (
          <BarChart
            data={modelBars}
            dataKey="calls"
            xAxisKey="modelLabel"
            height={280}
            barRadius={[4, 4, 0, 0]}
            yAxisLabel="次数"
            emptyMessage="该时段暂无模型调用"
            tooltipFormatter={(value: number, _name: unknown, item: { payload?: AnalyticsModel }) => [
              `${value} 次`,
              item?.payload?.model ?? "",
            ]}
          />
        ) : null}

        {tab === "ranking" ? (
          models.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
              该时段暂无模型调用
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="w-10 py-2 font-medium">#</th>
                  <th className="py-2 font-medium">模型</th>
                  <th className="py-2 text-right font-medium">调用次数</th>
                  <th className="py-2 text-right font-medium">消耗</th>
                  <th className="w-28 py-2 text-right font-medium">占比</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m, i) => {
                  const share = totalCalls > 0 ? (m.calls / totalCalls) * 100 : 0;
                  return (
                    <tr key={m.model} className="border-b border-border/60 last:border-0">
                      <td className="py-2 text-muted-foreground">{i + 1}</td>
                      <td className="max-w-[280px] truncate py-2" title={m.model}>
                        {m.model}
                      </td>
                      <td className="py-2 text-right tabular-nums">{m.calls}</td>
                      <td className="py-2 text-right tabular-nums">
                        {Math.round(m.credits)} cr
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {share.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : null}

        {tab === "channel" ? (
          <PieChart
            data={channelRows}
            dataKey="credits"
            nameKey="name"
            height={280}
            emptyMessage="暂无渠道数据"
          />
        ) : null}

        {tab === "activity" ? <ActivitySpendChart points={activities} /> : null}
      </CardContent>
    </Card>
  );
}
