/**
 * Recharts theme configuration using design tokens
 */

// Chart colors from design tokens
export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const

// Common chart styles
export const chartConfig = {
  grid: {
    strokeDasharray: "3 3",
    stroke: "var(--border)",
  },
  axis: {
    tick: { fontSize: 12 },
    stroke: "var(--muted-foreground)",
  },
  tooltip: {
    contentStyle: {
      backgroundColor: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "8px",
      fontSize: "12px",
    },
  },
} as const

// Empty state component
export function ChartEmpty({
  message = "暂无数据",
  height = 250,
}: {
  message?: string;
  height?: number;
}) {
  return (
    <div
      className="flex items-center justify-center text-sm text-muted-foreground"
      style={{ height }}
    >
      {message}
    </div>
  )
}
