"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface HourlyUsageData {
  hour: number;
  calls: number;
  credits: number;
}

export function HourlyUsageChart({ data }: { data: HourlyUsageData[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
        今日暂无数据
      </div>
    );
  }

  // 补全 0-23 小时，缺失的小时填充为 0
  const fullData = Array.from({ length: 24 }, (_, i) => {
    const existing = data.find((d) => d.hour === i);
    return {
      hour: i,
      hourLabel: `${i.toString().padStart(2, "0")}:00`,
      calls: existing?.calls || 0,
      credits: existing?.credits || 0,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={fullData}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="hourLabel"
          tick={{ fontSize: 10 }}
          stroke="var(--muted-foreground)"
          interval={2} // 每隔2小时显示一个标签
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
        <Bar dataKey="credits" fill="var(--primary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
