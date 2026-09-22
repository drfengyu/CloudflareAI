"use client";

import { useState } from "react";
import { PieChart as PieChartIcon } from "lucide-react";
import { AreaChart, BarChart, LineChart, PieChart } from "@/components/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** 模型名只留最后一段，完整名放 tooltip / 排行表里。 */
function shortModel(model: string) {
  return model.split("/").pop() || model;
}

/**
 * 模型数据分析：一个卡片内切换五种视角。
 * 数据全部由服务端算好传入，tab 只决定展示形态，不重新请求。
 */
export function ModelAnalyticsCard({
  rangeLabel,
  series,
  models,
  channels,
  totalCalls,
}: {
  rangeLabel: string;
  series: AnalyticsPoint[];
  /** 按调用次数取的 Top 10 */
  models: AnalyticsModel[];
  channels: AnalyticsChannel[];
  /** 窗口内总调用数，用于排行占比 */
  totalCalls: number;
}) {
  const [tab, setTab] = useState<TabKey>("credits");

  const modelBars = models.map((m) => ({
    ...m,
    modelLabel: shortModel(m.model),
  }));

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border">
        <CardTitle className="flex items-center gap-2">
          <span className="text-muted-foreground">
            <PieChartIcon className="h-4 w-4" />
          </span>
          模型数据分析
        </CardTitle>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {TABS.map((t, i) => (
            <span key={t.key} className="flex items-center gap-1">
              {i > 0 ? <span className="text-border">/</span> : null}
              <button
                type="button"
                onClick={() => setTab(t.key)}
                aria-pressed={tab === t.key}
                className={`rounded-md px-2 py-1 text-xs transition-colors ${
                  tab === t.key
                    ? "bg-secondary font-semibold text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            </span>
          ))}
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <p className="mb-3 text-xs text-muted-foreground">{rangeLabel}</p>

        {tab === "credits" ? (
          <AreaChart
            data={series}
            dataKey="credits"
            xAxisKey="label"
            height={280}
            yAxisLabel="Credits"
            emptyMessage="该时段暂无消耗数据"
            tooltipFormatter={(value: number) => [`${Math.round(value)} cr`, "消耗"]}
          />
        ) : null}

        {tab === "trend" ? (
          <LineChart
            data={series}
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
            data={channels}
            dataKey="credits"
            nameKey="name"
            height={280}
            emptyMessage="暂无渠道数据"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
