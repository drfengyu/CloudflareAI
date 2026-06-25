"use client"

import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"
import { ChartContainer } from "./chart-container"
import { chartConfig, ChartEmpty } from "./chart-config"

interface LineChartProps<T> {
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

export function LineChart<T extends Record<string, any>>({
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
}: LineChartProps<T>) {
  if (data.length === 0) {
    return <ChartEmpty message={emptyMessage} />
  }

  return (
    <ChartContainer height={height}>
      <RechartsLineChart data={data}>
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
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={strokeWidth}
          dot={{ fill: color, r: 4 }}
          activeDot={{ r: 6 }}
        />
      </RechartsLineChart>
    </ChartContainer>
  )
}
