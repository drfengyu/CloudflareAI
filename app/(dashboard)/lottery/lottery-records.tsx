import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCredits } from "@/lib/billing/credits";
import { formatCnWallClock } from "@/lib/date";
import { cn } from "@/lib/utils";
import type {
  DrawRecord,
  LotteryBalance,
  LotteryTicketTotals,
} from "@/lib/lottery/records";

const TICKET_LABEL: Record<DrawRecord["ticketSource"], string> = {
  buy: "购买",
  gift: "赠送",
  prize: "抽中",
  unknown: "已失效",
};

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

function LotteryEmpty() {
  return <p className="text-sm text-muted-foreground">还没有开奖记录，抽一次就会出现在这里。</p>;
}

/**
 * 我的活动记录：逐次开奖的时间、落在哪一圈、结算 cr 与用掉的券。
 *
 * 净收益按**已开奖的券**算（中奖 − 倒扣 − 券面），没开奖的券还挂在券包里，
 * 不计盈也不计亏。
 */
export function LotteryRecords({
  balance,
  tickets,
  records,
  ticketsLeft,
  recordLimit,
}: {
  balance: LotteryBalance;
  tickets: LotteryTicketTotals;
  records: DrawRecord[];
  ticketsLeft: number;
  recordLimit: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-baseline justify-between gap-3 text-base">
          <span>我的活动记录</span>
          <span className="text-xs font-normal text-muted-foreground">
            明细为最近 {recordLimit} 次，汇总按活动期全量计
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {records.length === 0 ? (
          <LotteryEmpty />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="抽奖次数" hint={`外圈命中 ${balance.outerHits} 次`}>
                {balance.draws}
              </Stat>
              <Stat label="中奖发放">
                <span className="text-[color:var(--primary)]">
                  +{formatCredits(balance.paidOut)} cr
                </span>
              </Stat>
              <Stat label="倒扣回收">
                <span className="text-[color:var(--destructive)]">
                  −{formatCredits(balance.clawedBack)} cr
                </span>
              </Stat>
              <Stat label="已开奖券面值" hint={`累计购券 ${formatCredits(tickets.boughtCredits)} cr`}>
                {formatCredits(balance.ticketFace)} cr
              </Stat>
              <Stat label="本期净收益" hint="中奖 − 倒扣 − 券面">
                <Delta value={-balance.net} />
              </Stat>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">时间</th>
                    <th className="px-3 py-2 font-medium">圈层</th>
                    <th className="px-3 py-2 font-medium">结果</th>
                    <th className="px-3 py-2 font-medium">cr 变动</th>
                    <th className="px-3 py-2 font-medium">抽奖券</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-secondary/30">
                      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                        {r.createdAt ? formatCnWallClock(r.createdAt) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={r.ring === "outer" ? "accent" : "muted"} className="text-[10px]">
                          {r.ring === "outer" ? "外圈" : "内圈"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {r.label}
                        {r.ring === "outer" && r.baseCredits > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            （基数 {formatCredits(r.baseCredits)} cr）
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.deltaCredits === 0 && r.grantTickets > 0 ? (
                          <span className="text-muted-foreground">不发 cr</span>
                        ) : (
                          <Delta value={r.deltaCredits} />
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {TICKET_LABEL[r.ticketSource]}
                        {r.ticketSource === "buy" && ` ${formatCredits(r.ticketCredits)} cr`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              券包中尚有 {ticketsLeft} 张未开奖（其中购得面值 {formatCredits(tickets.unusedCredits)}{" "}
              cr），这部分不计入净收益；中奖 cr 以临时余额发放，过期未用自动作废。
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
