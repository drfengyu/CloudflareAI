import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCredits } from "@/lib/billing/credits";
import { cn } from "@/lib/utils";
import type { LotteryBalance } from "@/lib/lottery/records";

function Delta({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        value > 0
          ? "text-[color:var(--primary)]"
          : value < 0
            ? "text-[color:var(--destructive)]"
            : "text-muted-foreground",
      )}
    >
      {value > 0 ? "+" : ""}
      {formatCredits(value)} cr
    </span>
  );
}

/** 汇总格：值 + 口径说明，两者都放在数据侧算好，这里只排版。 */
function Stat({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{children}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * 我的转盘战绩：只展示当期活动的汇总数字。
 *
 * 逐次开奖明细不再提供给用户；收益仍按已开奖的注计算，
 * 消耗取开奖时实际抵扣的活动券面值（cr 等值）。
 */
export function LotteryStats({
  balance,
  activityLabel,
}: {
  /** 当期活动战绩；null 表示当前没有活动轮次。 */
  balance: LotteryBalance | null;
  /** 当期活动的显示标签（通常是开始时间）。 */
  activityLabel: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">我的转盘战绩</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {balance ? (
          <div>
            <p className="mb-2 text-xs font-medium text-[color:var(--primary)]">
              当前活动（{activityLabel}）战绩
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="抽奖次数" hint={`外圈命中 ${balance.outerHits} 次`}>
                {balance.draws}
              </Stat>
              <Stat label="中奖发放" hint="含 tcr 与 cr">
                <span className="text-[color:var(--primary)]">
                  +{formatCredits(balance.paidOut)} cr 等值
                </span>
              </Stat>
              <Stat label="倒扣回收">
                <span className="text-[color:var(--destructive)]">
                  −{formatCredits(balance.clawedBack)} cr 等值
                </span>
              </Stat>
              <Stat label="已开奖消耗" hint="按活动券面计">
                {formatCredits(balance.ticketFace)} cr
              </Stat>
              <Stat label="本期净收益" hint="中奖 − 倒扣 − 消耗（cr 等值）">
                <Delta value={-balance.net} />
              </Stat>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">当前没有活动轮次。</p>
        )}

        <p className="text-[11px] text-muted-foreground">
          收益按已开奖的注计算，消耗取开奖时实际抵扣的活动券面值；中奖按注发放 tcr 或 cr——
          tcr 到期未用自动作废，cr 不过期。
        </p>
      </CardContent>
    </Card>
  );
}
