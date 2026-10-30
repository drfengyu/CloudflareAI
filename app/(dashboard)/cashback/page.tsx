import { Coins, Trophy } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CashbackClaimPanel } from "@/components/cashback/claim-panel";
import { formatCredits } from "@/lib/billing/credits";
import {
  getUsageLeaderboard,
  leaderboardStartMs,
  listMyClaims,
  listRecentDays,
  sumCreditsSince,
} from "@/lib/cashback/claims";
import { getCashbackSettings } from "@/lib/settings";
import { requireUser } from "@/lib/usage/meter";

export const dynamic = "force-dynamic";

export default async function CashbackPage() {
  const userId = await requireUser();
  const settings = await getCashbackSettings();

  const [days, claims, leaderboard, windowCredits] = await Promise.all([
    listRecentDays(userId, settings),
    listMyClaims(userId),
    getUsageLeaderboard(settings, userId),
    sumCreditsSince(userId, leaderboardStartMs(settings)),
  ]);
  const claimedTotal = claims.reduce((sum, c) => sum + c.rewardCredits, 0);
  const claimable = days.filter((d) => d.claimable);

  return (
    <>
      <PageHeader title="消费返利" description={`按北京自然日结算，近 ${settings.leaderboardDays} 天用量冲榜`} />
      <div className="space-y-4 p-8">
        {!settings.enabled && (
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            消费返利当前未开启，用量照常记录；开启后按下面的规则返还，历史用量不会补发。
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">
                可领清单
                {claimable.length > 0 ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {claimable.length} 天待领取
                  </span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {days.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无可结算的日期。</p>
              ) : (
                <CashbackClaimPanel days={days} />
              )}
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">我的数据</CardTitle>
            </CardHeader>
            {/* 与左边「可领清单」同高：统计块吃掉剩余高度，不留下半截空白 */}
            <CardContent className="grid flex-1 grid-cols-2 gap-3">
              <div className="flex flex-col justify-center rounded-lg border border-border p-4 text-center">
                <Coins className="mx-auto h-4 w-4 text-muted-foreground" />
                <div className="mt-2 text-2xl font-semibold tabular-nums">
                  {formatCredits(windowCredits)}
                </div>
                <div className="text-xs text-muted-foreground">近 {settings.leaderboardDays} 天消耗 cr</div>
              </div>
              <div className="flex flex-col justify-center rounded-lg border border-border p-4 text-center">
                <Trophy className="mx-auto h-4 w-4 text-muted-foreground" />
                <div className="mt-2 text-2xl font-semibold tabular-nums">
                  {formatCredits(claimedTotal)}
                </div>
                <div className="text-xs text-muted-foreground">累计已领 cr</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">用量冲榜 · 近 {settings.leaderboardDays} 天</CardTitle>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground">这段时间还没有消耗记录。</p>
            ) : (
              <div className="space-y-1">
                {leaderboard.map((row) => (
                  <div
                    key={row.rank}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                      row.isSelf ? "border-primary bg-primary/5" : "border-border bg-card"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="w-6 text-right font-semibold tabular-nums">{row.rank}</span>
                      <span className={row.isSelf ? "font-medium" : "text-muted-foreground"}>
                        {row.label}
                        {row.isSelf ? "（我）" : ""}
                      </span>
                    </span>
                    <span className="tabular-nums">{formatCredits(row.credits)} cr</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">返利规则</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                按北京自然日结算：每天的消费在次日可领，最多往前补{" "}
                <strong className="text-foreground">{settings.backfillDays}</strong> 天。
              </li>
              <li>
                返比例为 <strong className="text-foreground">{(settings.rate * 100).toFixed(1)}%</strong>
                ，单日消费满 <strong className="text-foreground">{formatCredits(settings.minCredits)} cr</strong>{" "}
                起返，单日最多返 <strong className="text-foreground">{formatCredits(settings.cap)} cr</strong>。
              </li>
              <li>
                返利进入<b>临时余额</b>，有效期 <strong className="text-foreground">{settings.validDays}</strong>{" "}
                天，到期未用自动作废；用量按上游真实 token 计，失败调用不计消费也不参与返利。
              </li>
              <li>排行榜为脱敏展示（邮箱首字符 + ***），只读排名不发放奖励。</li>
            </ul>
          </CardContent>
        </Card>

        {claims.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">领取历史</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {claims.map((c) => (
                <div
                  key={c.periodDate}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm"
                >
                  <span className="text-muted-foreground">{c.periodDate}</span>
                  <span className="tabular-nums">
                    消费 {formatCredits(c.consumedCredits)} cr
                    <span className="ml-2 font-semibold text-success">
                      +{formatCredits(c.rewardCredits)} cr
                    </span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
