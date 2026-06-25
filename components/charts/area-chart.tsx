"use client"

import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"
import { ChartContainer } from "./chart-container"
import { chartConfig, ChartEmpty } from "./chart-config"

interface AreaChartProps<T> {
  data: T[]
  dataKey: string
  xAxisKey: string
  height?: number
  color?: string
  yAxisLabel?: string
  tooltipFormatter?: any
  xAxisFormatter?: (value: any) => string
  strokeWidth?: number
  emptyMessage?: string
}

export function AreaChart<T extends Record<string, any>>({
  data,
  dataKey,
  xAxisKey,
  height = 250,
  color = "var(--primary)",
  yAxisLabel,
  tooltipFormatter,
  xAxisFormatter,
  strokeWidth = 2,
  emptyMessage,
}: AreaChartProps<T>) {
  if (data.length === 0) {
    return <ChartEmpty message={emptyMessage} />
  }

  return (
    <ChartContainer height={height}>
      <RechartsAreaChart data={data}>
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
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={strokeWidth}
          fill={color}
          fillOpacity={0.2}
        />
      </RechartsAreaChart>
    </ChartContainer>
  )
}
