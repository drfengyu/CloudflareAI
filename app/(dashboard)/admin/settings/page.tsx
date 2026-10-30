import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db/d1-http";
import { users, options } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { redirect } from "next/navigation";
import { SettingsForm, PricingSettingsForm, CheckinSettingsForm, InviteSettingsForm, CashbackSettingsForm, RechargeBonusSettingsForm, TaskSettingsForm, AuthChannelsForm, EpaySettingsForm, LinuxdoSettingsForm } from "./settings-form";
import { DashboardInfoForm } from "./dashboard-info-form";
import { LotteryForm } from "./lottery-form";
import { RaidenForm } from "./raiden-form";
import { sanitizeLotteryConfig } from "@/lib/lottery/prize-math";
import { sanitizeRaidenConfig } from "@/lib/raiden/config";
import { TASKS } from "@/lib/tasks/tasks";
import type { AnnouncementInput, FaqItem } from "@/lib/settings/dashboard-info";

export const dynamic = "force-dynamic";

/** option 表存的是字符串，编辑器里需要还原成数组；脏数据按空数组处理。 */
function parseArray<T>(raw: string | undefined): T[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export default async function AdminSettingsPage() {
  const currentUserId = await requireUser();

  // 2026-10-23 性能：权限检查 + 设置查询并发（原先串行 3 次 D1 往返）。
  // lotteryConfig 直接从 allSettings 里取，不再单独调 getLotteryConfig（省一次 D1）。
  const [currentUser, allSettings] = await Promise.all([
    db
      .select()
      .from(users)
      .where(eq(users.id, currentUserId))
      .limit(1),
    db.select().from(options),
  ]);

  if (!currentUser[0] || currentUser[0].role < 10) {
    redirect("/dashboard");
  }

  // 转换为 key-value 对象
  const settings: Record<string, string> = {};
  allSettings.forEach((opt) => {
    settings[opt.key] = opt.value;
  });

  // 从 allSettings 里直接解析 lotteryConfig，避免额外一次 getSetting 查询
  const lotteryConfig = (() => {
    const raw = settings.lottery_config;
    if (!raw) return sanitizeLotteryConfig(null);
    try {
      return sanitizeLotteryConfig(JSON.parse(raw));
    } catch {
      return sanitizeLotteryConfig(null);
    }
  })();

  // 雷电行动配置同理，直接从 allSettings 解析
  const raidenConfig = (() => {
    const raw = settings.raiden_config;
    if (!raw) return sanitizeRaidenConfig(null);
    try {
      return sanitizeRaidenConfig(JSON.parse(raw));
    } catch {
      return sanitizeRaidenConfig(null);
    }
  })();

  return (
    <>
      <PageHeader
        title="系统设置"
        description="管理平台配置、功能开关"
      />

      <div className="space-y-6 p-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">基础设置</CardTitle>
          </CardHeader>
          <CardContent>
            <SettingsForm
              initialSettings={{
                siteName: settings.siteName || "Cloudflare AI Console",
                defaultBalanceValidDays: settings.defaultBalanceValidDays || "365",
                creditsPerUsd: settings.creditsPerUsd || "1",
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">全局定价倍率</CardTitle>
          </CardHeader>
          <CardContent>
            <PricingSettingsForm
              initialSettings={{
                baseMultiplier: settings.pricing_base_multiplier || "1000",
                adjustThreshold: settings.pricing_adjust_threshold || "100",
                adjustMultiplierLow: settings.pricing_adjust_multiplier_low || "5",
                adjustMultiplierHigh: settings.pricing_adjust_multiplier_high || "1",
                defaultPricePerMillion: settings.pricing_default_price_per_million || "100",
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">签到设置</CardTitle>
          </CardHeader>
          <CardContent>
            <CheckinSettingsForm
              initialSettings={{
                enabled: settings.checkin_enabled === "true",
                minQuota: settings.checkin_min_quota || "0.01",
                maxQuota: settings.checkin_max_quota || "0.1",
                validDays: settings.checkin_valid_days || "7",
                streakEnabled: settings.checkin_streak_enabled !== "false",
                streakDays: settings.checkin_streak_days || "7",
                streakReward: settings.checkin_streak_reward || "200",
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">邀请奖励</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteSettingsForm
              initialSettings={{
                enabled: settings.invite_enabled !== "false",
                inviterReward: settings.invite_reward_inviter || "300",
                inviteeReward: settings.invite_reward_invitee || "200",
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">消费返利</CardTitle>
          </CardHeader>
          <CardContent>
            <CashbackSettingsForm
              initialSettings={{
                enabled: settings.cashback_enabled === "true" || settings.cashback_enabled === "1",
                rate: settings.cashback_rate || "0.1",
                minCredits: settings.cashback_min_credits || "20",
                cap: settings.cashback_cap || "200",
                validDays: settings.cashback_valid_days || "7",
                backfillDays: settings.cashback_backfill_days || "3",
                leaderboardDays: settings.cashback_leaderboard_days || "7",
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">充值阶梯赠送</CardTitle>
          </CardHeader>
          <CardContent>
            <RechargeBonusSettingsForm
              initialSettings={{
                enabled: settings.recharge_bonus_enabled === "true" || settings.recharge_bonus_enabled === "1",
                validDays: settings.recharge_bonus_valid_days || "30",
                tiersJson: settings.recharge_bonus_tiers || "[]",
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">任务成就奖励</CardTitle>
          </CardHeader>
          <CardContent>
            <TaskSettingsForm
              initialSettings={{
                enabled: settings.tasks_enabled === "true" || settings.tasks_enabled === "1",
                validDays: settings.tasks_valid_days || "30",
                rewardOverridesJson: settings.task_reward_overrides || "{}",
              }}
              catalog={TASKS.map((t) => ({
                key: t.key,
                title: t.title,
                target: t.target,
                defaultReward: t.defaultReward,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">在线充值（易支付）</CardTitle>
          </CardHeader>
          <CardContent>
            <EpaySettingsForm
              initialSettings={{
                enabled: settings.epay_enabled === "true",
                apiUrl: settings.epay_api_url || "",
                pid: settings.epay_pid || "",
                key: settings.epay_key || "",
                rate: settings.recharge_rate || "10",
                minCny: settings.recharge_min || "1",
                maxCny: settings.recharge_max || "1000",
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">在线充值（LinuxDO 积分）</CardTitle>
          </CardHeader>
          <CardContent>
            <LinuxdoSettingsForm
              initialSettings={{
                enabled: settings.ldpay_enabled === "true",
                apiUrl: settings.ldpay_api_url || "https://credit.linux.do/epay",
                pid: settings.ldpay_pid || "",
                key: settings.ldpay_key || "",
                rate: settings.ldpay_rate || "1",
                minCny: settings.ldpay_min || "1",
                maxCny: settings.ldpay_max || "1000",
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">认证渠道</CardTitle>
          </CardHeader>
          <CardContent>
            <AuthChannelsForm
              initialSettings={{
                emailEnabled: settings.auth_email_enabled !== "false",
                githubEnabled: settings.auth_github_enabled !== "false",
                linuxdoEnabled: settings.auth_linuxdo_enabled !== "false",
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">看板信息（公告 / 问答 / 服务可用性）</CardTitle>
          </CardHeader>
          <CardContent>
            <DashboardInfoForm
              initialSettings={{
                announcements: parseArray<AnnouncementInput>(settings.dashboard_announcements),
                faq: parseArray<FaqItem>(settings.dashboard_faq),
                uptimeEnabled: settings.uptime_enabled === "true",
                uptimeApiUrl: settings.uptime_api_url || "",
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">限时活动（幸运转盘）</CardTitle>
          </CardHeader>
          <CardContent>
            <LotteryForm initialConfig={lotteryConfig} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">限时活动（雷电行动）</CardTitle>
          </CardHeader>
          <CardContent>
            <RaidenForm initialConfig={raidenConfig} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
