import { Coins, Gift, Inbox, Trophy } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CashbackClaimPanel } from "@/components/cashback/claim-panel";
import { RechargeTierPanel } from "@/components/cashback/recharge-panel";
import { PageBody } from "@/components/dashboard/section";
import { formatCredits } from "@/lib/billing/credits";
import {
  getUsageLeaderboard,
  leaderboardStartMs,
  listMyClaims,
  listRecentDays,
  sumCreditsSince,
} from "@/lib/cashback/claims";
import { getRechargeActivity } from "@/lib/rewards/claims";
import { getCashbackSettings } from "@/lib/settings";
import { requireUser } from "@/lib/usage/meter";

export const dynamic = "force-dynamic";

function rechargeStatusLabel(
  status: "disabled" | "upcoming" | "active" | "ended",
  startDate: string,
  endDate: string,
): string {
  if (status === "disabled") return "未开启";
  if (status === "upcoming") return `${startDate} 开始`;
  if (status === "ended") return `${endDate} 已结束`;
  return `${startDate}${endDate ? ` 至 ${endDate}` : " 起"} · 进行中`;
}

export default async function CashbackPage() {
  const userId = await requireUser();
  const settings = await getCashbackSettings();

  const [days, claims, leaderboard, windowCredits, recharge] = await Promise.all([
    listRecentDays(userId, settings),
    listMyClaims(userId),
    getUsageLeaderboard(settings, userId),
    sumCreditsSince(userId, leaderboardStartMs(settings)),
    getRechargeActivity(userId),
  ]);
  const cashbackClaimed = claims.reduce((sum, c) => sum + c.rewardCredits, 0);
  const rechargeClaimed = recharge.tiers
    .filter((tier) => tier.claimState === "claimed")
    .reduce((sum, tier) => sum + tier.rewardCredits, 0);
  const claimableCashback = days.filter((d) => d.claimable).length;
  const claimableRecharge = recharge.active
    ? recharge.tiers.filter((tier) => tier.met && tier.claimState === "none").length
    : 0;

  return (
    <>
      <PageHeader
        title="限时返利"
        description={`充值累计档位 + 消费返利，奖励统一发到站内信领取 · 消费榜近 ${settings.leaderboardDays} 天`}
      />
      <PageBody className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          <Inbox className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--primary)]" />
          <span>
            活动页只负责把奖励<b className="text-foreground">发放到站内信</b>；打开站内信点「领取」后才会到账，
            到账为<b className="text-foreground">临时余额</b>，有有效期。未领取的附件不会被自动清理。
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span className="flex items-center gap-2">
                  <Gift className="h-4 w-4" />
                  限时充值活动
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {rechargeStatusLabel(recharge.status, recharge.startDate, recharge.endDate)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              {recharge.tiers.length === 0 ? (
                <p className="text-sm text-muted-foreground">后台还没有配置充值档位。</p>
              ) : (
                <>
                  <RechargeTierPanel activity={recharge} />
                  {claimableRecharge > 0 ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      有 <strong className="text-foreground">{claimableRecharge}</strong> 个达标档位待发放。
                    </p>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span className="flex items-center gap-2">
                  <Coins className="h-4 w-4" />
                  限时消费返利
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {settings.enabled
                    ? claimableCashback > 0
                      ? `${claimableCashback} 天待发放`
                      : "进行中"
                    : "未开启"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              {days.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无可结算的日期。</p>
              ) : (
                <CashbackClaimPanel days={days} />
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                按北京自然日结算，最多往前补 {settings.backfillDays} 天；今天消费次日才可发放。
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
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
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4" />
                我的数据
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-lg font-semibold tabular-nums">{formatCredits(windowCredits)}</div>
                <div className="text-[11px] text-muted-foreground">近 {settings.leaderboardDays} 天消耗 cr</div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-lg font-semibold tabular-nums">{formatCredits(cashbackClaimed)}</div>
                <div className="text-[11px] text-muted-foreground">消费返利已领 cr</div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-lg font-semibold tabular-nums">{formatCredits(rechargeClaimed)}</div>
                <div className="text-[11px] text-muted-foreground">充值奖励已领 cr</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">活动规则</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                充值活动按活动期内<b className="text-foreground">已完成的在线充值累计实付</b>
                统计：达到的每个档位都能各发一次，不是只取最高一档；LinuxDO 积分与人民币同口径累计。
              </li>
              <li>
                充值奖励到账为临时余额，有效期{" "}
                <strong className="text-foreground">{recharge.validDays}</strong> 天，钱包流水记「充值赠送」。
              </li>
              <li>
                消费返利按北京自然日结算：返{" "}
                <strong className="text-foreground">{(settings.rate * 100).toFixed(1)}%</strong>，单日消费满{" "}
                <strong className="text-foreground">{formatCredits(settings.minCredits)} cr</strong> 起返，单日最多{" "}
                <strong className="text-foreground">{formatCredits(settings.cap)} cr</strong>；到账为临时余额，
                有效期 {settings.validDays} 天。
              </li>
              <li>用量按上游真实 token 计，失败调用不计消费也不参与返利；排行榜脱敏展示，只读排名不发奖励。</li>
              <li>站内信里待领取的附件不会被清理；领取后这封信满 3 天自动删除。</li>
            </ul>
          </CardContent>
        </Card>

        {claims.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">消费返利领取历史</CardTitle>
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
      </PageBody>
    </>
  );
}