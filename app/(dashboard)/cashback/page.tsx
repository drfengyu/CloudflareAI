import Link from "next/link";
import { ArrowRight, Coins, Gift, Inbox, Ticket, Trophy } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CashbackTierPanel } from "@/components/cashback/cashback-tier-panel";
import { RechargeTierPanel } from "@/components/cashback/recharge-panel";
import { PageBody } from "@/components/dashboard/section";
import { formatCredits } from "@/lib/billing/credits";
import {
  getCashbackActivity,
  getUsageLeaderboard,
  leaderboardStartMs,
  sumCreditsSince,
} from "@/lib/cashback/claims";
import { getRechargeActivity, type RechargeActivityStatus } from "@/lib/rewards/claims";
import { getCashbackSettings } from "@/lib/settings";
import { listActivityCoupons, type ActivityStatus } from "@/lib/activity/coupons";
import { requireUser } from "@/lib/usage/meter";

export const dynamic = "force-dynamic";

function windowLabel(
  status: RechargeActivityStatus,
  startDate: string,
  endDate: string,
): string {
  if (status === "disabled") return "未开启";
  if (status === "upcoming") return `${startDate} 开始`;
  if (status === "ended") return `${endDate || startDate} 已结束`;
  return `${startDate}${endDate ? ` 至 ${endDate}` : " 起"} · 进行中`;
}

function couponStatusLabel(status: ActivityStatus): string {
  if (status === "active") return "进行中";
  if (status === "pending") return "未开始";
  if (status === "ended") return "已结束";
  return "未开启";
}

export default async function CashbackPage() {
  const userId = await requireUser();
  const settings = await getCashbackSettings();

  const [recharge, cashback, coupons, leaderboard, windowCredits] = await Promise.all([
    getRechargeActivity(userId),
    getCashbackActivity(userId),
    listActivityCoupons(userId),
    getUsageLeaderboard(settings, userId),
    sumCreditsSince(userId, leaderboardStartMs(settings)),
  ]);

  const claimableRecharge = recharge.active
    ? recharge.tiers.filter((tier) => tier.met && tier.claimState === "none").length
    : 0;
  const claimableCashback = cashback.active
    ? cashback.tiers.filter((tier) => tier.met && tier.claimState === "none").length
    : 0;
  const metCashback = cashback.tiers.filter((tier) => tier.met).length;

  return (
    <>
      <PageHeader
        title="活动中心"
        description={`限时充值、消费返利与三种玩法券 · 奖励统一发到站内信领取 · 消费榜近 ${settings.leaderboardDays} 天`}
      />
      <PageBody className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          <Inbox className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--primary)]" />
          <span>
            活动页只负责把奖励<b className="text-foreground">发放到站内信</b>；打开站内信点「领取」后才会到账。
            未领取的附件不会被自动清理，领取后这封信满 3 天自动删除。
          </span>
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">玩法入口与活动券</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {coupons.map((item) => (
              <Link
                key={item.kind}
                href={item.href}
                className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Ticket className="h-4 w-4 text-[color:var(--primary)]" />
                    {item.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {couponStatusLabel(item.status)}
                  </span>
                </div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{item.couponName}余额</p>
                    <p className="text-xl font-semibold tabular-nums">
                      {formatCredits(item.credits)}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">cr 券面</span>
                    </p>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-[color:var(--primary)]">
                    进入玩法
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  约 {formatCredits(item.credits / item.unitCredits)} 张 · 1 张 ={" "}
                  {formatCredits(item.unitCredits)} cr · 当期结束后作废
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  珍宝礼包 200% / 500% / 1000%
                </p>
              </Link>
            ))}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span className="flex items-center gap-2">
                  <Gift className="h-4 w-4" />
                  限时充值活动
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {windowLabel(recharge.status, recharge.startDate, recharge.endDate)}
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
                  {windowLabel(cashback.status, cashback.startDate, cashback.endDate)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              {cashback.tiers.length === 0 ? (
                <p className="text-sm text-muted-foreground">后台还没有配置消费档位。</p>
              ) : (
                <>
                  <CashbackTierPanel activity={cashback} />
                  {claimableCashback > 0 ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      有 <strong className="text-foreground">{claimableCashback}</strong> 个达标档位待发放。
                    </p>
                  ) : null}
                </>
              )}
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
                <div className="text-lg font-semibold tabular-nums">{formatCredits(cashback.cumulative)}</div>
                <div className="text-[11px] text-muted-foreground">活动期累计消费 cr</div>
              </div>
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-lg font-semibold tabular-nums">
                  {metCashback}/{cashback.tiers.length}
                </div>
                <div className="text-[11px] text-muted-foreground">消费档位已达成</div>
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
                限时充值与消费返利<b className="text-foreground">共用同一活动时间段</b>：从开始日 00:00 起、
                结束日次日 00:00 止（北京时间），开始前与结束后的充值与消费都不计入。
              </li>
              <li>
                充值按活动期内<b className="text-foreground">已完成的在线充值累计实付</b>统计：达到的每个档位都能各发一次，
                不是只取最高一档；LinuxDO 积分与人民币同口径累计。奖励到账为临时余额（tcr），有效期{" "}
                <strong className="text-foreground">{recharge.validDays}</strong> 天。
              </li>
              <li>
                消费按活动期内<b className="text-foreground">累计消耗的 cr</b> 统计，逐档发放：
                每档发放时随机一种奖励——临时货币（tcr）、永久货币（cr）、当期活动券或 1–3 张抽奖券，档位越高区间越高。
                到账为临时余额时有效期 {cashback.validDays} 天。
              </li>
              <li>
                活动券按各玩法设置的单价（1 张 = X cr，可在玩法页查看）整张兑换，
                <b className="text-foreground">先花临时余额（tcr）再花永久余额（cr）</b>；
                券面按 cr 1:1 抵扣玩法费用。当期活动结束后券自动作废，下一轮活动会换成另一种券名。珍宝礼包按 200% / 500% / 1000% 三档出售。
              </li>
              <li>用量按上游真实 token 计，失败调用不计消费也不参与返利；排行榜脱敏展示，只读排名不发奖励。</li>
            </ul>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
