"use client"

import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts"
import { ChartContainer } from "./chart-container"
import { chartConfig, ChartEmpty, CHART_COLORS } from "./chart-config"

interface PieChartProps<T> {
  data: T[]
  dataKey: string
  nameKey: string
  height?: number
  colors?: readonly string[]
  legend?: boolean
  emptyMessage?: string
}

export function PieChart<T extends Record<string, unknown>>({
  data,
  dataKey,
  nameKey,
  height = 250,
  colors = CHART_COLORS,
  legend = true,
  emptyMessage,
}: PieChartProps<T>) {
  if (data.length === 0) {
    return <ChartEmpty message={emptyMessage} />
  }

  return (
    <ChartContainer height={height}>
      <RechartsPieChart>
        <Pie
          data={data}
          dataKey={dataKey}
          nameKey={nameKey}
          cx="50%"
          cy="50%"
          innerRadius="45%"
          outerRadius="75%"
          paddingAngle={2}
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Tooltip
          {...chartConfig.tooltip}
          formatter={(value: unknown, name: unknown) => [
            `${Math.round(Number(value)).toLocaleString()}`,
            String(name ?? ""),
          ]}
        />
        {legend && (
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12 }}
          />
        )}
      </RechartsPieChart>
    </ChartContainer>
  )
}