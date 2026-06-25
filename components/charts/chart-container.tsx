"use client"

import { ResponsiveContainer } from "recharts"
import { cn } from "@/lib/utils"

interface ChartContainerProps {
  children: React.ReactNode
  className?: string
  height?: number
}

export function ChartContainer({
  children,
  className,
  height = 250,
}: ChartContainerProps) {
  return (
    <ResponsiveContainer width="100%" height={height} className={cn(className)}>
      {children}
    </ResponsiveContainer>
  )
}
