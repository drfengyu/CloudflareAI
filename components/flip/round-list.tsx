import { formatCnWallClock } from "@/lib/date";
import { formatCredits } from "@/lib/billing/credits";
import { cn } from "@/lib/utils";
import type { FlipRoundView } from "@/lib/flip/records";

function Delta({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        value > 0
          ? "text-success"
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

/** 我的牌局：一行一局；还没翻完的那局标「待翻开」，盈亏留空。 */
export function FlipRoundList({ rounds }: { rounds: FlipRoundView[] }) {
  if (rounds.length === 0) {
    return <p className="text-sm text-muted-foreground">本期还没有牌局，开一局就会出现在这里。</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-secondary/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">时间</th>
            <th className="px-3 py-2 font-medium">翻开</th>
            <th className="px-3 py-2 font-medium">票价</th>
            <th className="px-3 py-2 font-medium">中奖</th>
            <th className="px-3 py-2 font-medium">本局盈亏</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rounds.map((round) => {
            const reward = round.reward;
            return (
              <tr key={round.id} className="hover:bg-secondary/30">
                <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">
                  {formatCnWallClock(round.createdAt)}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {reward === null ? (
                    <span className="text-xs text-muted-foreground">待翻开</span>
                  ) : (
                    `第 ${Number(round.position) + 1} 张`
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">
                  −{formatCredits(round.priceCredits)} cr
                </td>
                <td className="px-3 py-2">
                  {reward === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : reward > 0 ? (
                    <span className="font-medium tabular-nums text-success">
                      +{formatCredits(reward)} cr
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">空牌</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {reward === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <Delta value={reward - round.priceCredits} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
