"use client"

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts"
import { ChartContainer } from "./chart-container"
import { chartConfig, ChartEmpty, CHART_COLORS } from "./chart-config"

interface BarChartProps<T> {
  data: T[]
  dataKey: string
  xAxisKey: string
  height?: number
  colors?: readonly string[]
  yAxisLabel?: string
  tooltipFormatter?: any
  xAxisFormatter?: (value: any) => string
  barRadius?: number | [number, number, number, number]
  emptyMessage?: string
}

export function BarChart<T extends Record<string, any>>({
  data,
  dataKey,
  xAxisKey,
  height = 250,
  colors = CHART_COLORS,
  yAxisLabel,
  tooltipFormatter,
  xAxisFormatter,
  barRadius = [4, 4, 0, 0],
  emptyMessage,
}: BarChartProps<T>) {
  if (data.length === 0) {
    return <ChartEmpty message={emptyMessage} />
  }

  return (
    <ChartContainer height={height}>
      <RechartsBarChart data={data}>
        <CartesianGrid {...chartConfig.grid} />
        <XAxis
          dataKey={xAxisKey}
          {...chartConfig.axis}
          tickFormatter={xAxisFormatter}
        />
        <YAxis
          {...chartConfig.axis}
          label={
            yAxisLabel
              ? {
                  value: yAxisLabel,
                  angle: -90,
                  position: "insideLeft",
                  fontSize: 12,
                }
              : undefined
          }
        />
        <Tooltip
          {...chartConfig.tooltip}
          formatter={tooltipFormatter}
        />
        <Bar dataKey={dataKey} radius={barRadius}>
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
          ))}
        </Bar>
      </RechartsBarChart>
    </ChartContainer>
  )
}
