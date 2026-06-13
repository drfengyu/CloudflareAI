"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DailyUsageData {
  date: string;
  calls: number;
  credits: number;
}

export function UsageTrendChart({ data }: { data: DailyUsageData[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
        暂无数据
      </div>
    );
  }

  // 格式化日期：只显示月-日
  const formattedData = data.map((d) => ({
    ...d,
    dateLabel: d.date.slice(5), // "2026-06-13" -> "06-13"
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={formattedData}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="dateLabel"
          tick={{ fontSize: 12 }}
          stroke="var(--muted-foreground)"
        />
        <YAxis
          tick={{ fontSize: 12 }}
          stroke="var(--muted-foreground)"
          label={{ value: "Credits", angle: -90, position: "insideLeft", fontSize: 12 }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          formatter={(value: any, name: any) => {
            if (name === "credits") return [`${Math.round(Number(value))} credits`, "消耗"];
            if (name === "calls") return [value, "调用次数"];
            return [value, name];
          }}
        />
        <Line
          type="monotone"
          dataKey="credits"
          stroke="var(--primary)"
          strokeWidth={2}
          dot={{ fill: "var(--primary)", r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
