"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface ModelUsageData {
  model: string;
  calls: number;
  credits: number;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--muted-foreground))",
];

export function ModelDistributionChart({ data }: { data: ModelUsageData[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
        暂无数据
      </div>
    );
  }

  // 简化模型名称：取最后一段
  const formattedData = data.map((d) => ({
    ...d,
    modelLabel: d.model.split("/").pop() || d.model,
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={formattedData}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="modelLabel"
          tick={{ fontSize: 10 }}
          stroke="var(--muted-foreground)"
          angle={-15}
          textAnchor="end"
          height={60}
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
          formatter={(value: any, name: any, props: any) => {
            if (name === "credits") {
              return [
                `${Math.round(Number(value))} credits`,
                `${props.payload.model} (${props.payload.calls} 次)`,
              ];
            }
            return [value, name];
          }}
          labelFormatter={() => ""}
        />
        <Bar dataKey="credits" radius={[4, 4, 0, 0]}>
          {formattedData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
