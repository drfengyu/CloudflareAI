"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCredits } from "@/lib/billing/credits";
import type { ActivitySpendPoint } from "@/lib/usage/activity-spend";

const SPENT_COLOR = "var(--destructive)";
const EARNED_COLOR = "var(--primary)";
const NET_COLOR = "var(--chart-4)";

/** 坐标轴刻度：几十万上百万直接写会把刻度挤成重叠，改用「万」，精确值留给悬浮提示。 */
function axisTick(value: number) {
  const abs = Math.abs(value);
  if (abs >= 10_000) return `${(value / 10_000).toFixed(abs >= 100_000 ? 0 : 1)}万`;
  return `${Math.round(value)}`;
}

function tooltipCr(value: number) {
  return Number.isFinite(value) ? `${formatCredits(value)} cr` : "—";
}

/**
 * 「模型数据分析」卡的限时活动视角：三个玩法各画消耗柱与收入柱，
 * 净收入用平滑曲线叠在同一坐标系上，亏了就走进负半轴。
 */
export function ActivitySpendChart({ points }: { points: ActivitySpendPoint[] }) {
  const totalSpent = points.reduce((sum, p) => sum + p.spent, 0);
  const totalEarned = points.reduce((sum, p) => sum + p.earned, 0);
  const totalNet = Math.round((totalEarned - totalSpent) * 100) / 100;

  if (totalSpent === 0 && totalEarned === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        该时段没有参加限时活动
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={points} margin={{ top: 8, right: 0, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 12 }}
            stroke="var(--muted-foreground)"
            tickFormatter={axisTick}
            width={56}
          />
          {/* 净收入与消耗差着两三个数量级，共用一根轴会被压成贴着零线的平线，所以单独走右轴 */}
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 12 }}
            stroke={NET_COLOR}
            tickFormatter={axisTick}
            width={52}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(value) => tooltipCr(Number(value))}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine yAxisId="right" y={0} stroke={NET_COLOR} strokeDasharray="4 4" />
          <Bar
            yAxisId="left"
            dataKey="spent"
            name="消耗"
            fill={SPENT_COLOR}
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
          />
          <Bar
            yAxisId="left"
            dataKey="earned"
            name="收入"
            fill={EARNED_COLOR}
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="net"
            name="净收入"
            stroke={NET_COLOR}
            strokeWidth={2}
            dot={{ r: 3, fill: NET_COLOR }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="mt-3 text-xs text-muted-foreground">
        柱 = 消耗与收入（左轴），曲线 = 净收入（右轴，可为负）。合计消耗 {formatCredits(totalSpent)} cr ·
        收入 {formatCredits(totalEarned)} cr ·{" "}
        <span
          className={totalNet >= 0 ? "text-[color:var(--primary)]" : "text-[color:var(--destructive)]"}
        >
          净收入 {totalNet > 0 ? "+" : ""}
          {formatCredits(totalNet)} cr
        </span>
        （口径为账本流水：买券 / 装备复活 / 票价为消耗，中奖与通关奖励为收入，赠券不动 cr）
      </p>
    </div>
  );
}
