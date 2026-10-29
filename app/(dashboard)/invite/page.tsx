import { desc, eq, inArray, sql } from "drizzle-orm";
import { Coins, Users } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { db } from "@/lib/db/d1-http";
import { inviteRecords, users } from "@/lib/db/schema";
import { ensureInviteCode } from "@/lib/db/queries";
import { getInviteSettings } from "@/lib/settings";
import { getRequestOrigin } from "@/lib/request-origin";
import { INVITE_DAILY_REWARD_LIMIT, maskEmail } from "@/lib/invite/rewards";
import { formatCredits } from "@/lib/billing/credits";
import { formatCnDate } from "@/lib/date";
import { requireUser } from "@/lib/usage/meter";

export const dynamic = "force-dynamic";

export default async function InvitePage() {
  const userId = await requireUser();

  const [code, settings, origin, records, stats] = await Promise.all([
    ensureInviteCode(userId),
    getInviteSettings(),
    getRequestOrigin(),
    db
      .select({
        id: inviteRecords.id,
        inviteeId: inviteRecords.inviteeId,
        inviterReward: inviteRecords.inviterReward,
        createdAt: inviteRecords.createdAt,
      })
      .from(inviteRecords)
      .where(eq(inviteRecords.inviterId, userId))
      .orderBy(desc(inviteRecords.createdAt))
      .limit(20),
    db
      .select({
        count: sql<number>`COUNT(*)`,
        reward: sql<number>`COALESCE(SUM(${inviteRecords.inviterReward}), 0)`,
      })
      .from(inviteRecords)
      .where(eq(inviteRecords.inviterId, userId)),
  ]);

  const inviteeIds = records.map((r) => r.inviteeId);
  const inviteeRows = inviteeIds.length
    ? await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(inArray(users.id, inviteeIds))
    : [];
  const emailMap = new Map(inviteeRows.map((u) => [u.id, u.email ?? ""]));

  const link = `${origin}/register?ref=${code}`;
  const invitedCount = stats[0]?.count ?? 0;
  const totalReward = stats[0]?.reward ?? 0;

  return (
    <>
      <PageHeader
        title="邀请好友"
        description="邀请新用户注册，双方获得永久余额奖励"
      />
      <div className="space-y-4 p-8">
        {!settings.enabled && (
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            邀请奖励当前已暂停；邀请链接仍可正常注册，恢复后新的邀请会重新发放奖励。
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">我的邀请链接</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-4">
                <div>
                  <p className="text-xs text-muted-foreground">邀请码</p>
                  <p className="font-mono text-xl font-semibold tracking-wider">
                    {code}
                  </p>
                </div>
                <CopyButton value={code} label="复制邀请码" />
              </div>
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">邀请链接</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 text-xs">
                    {link}
                  </code>
                  <CopyButton value={link} label="复制链接" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">邀请数据</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border p-4 text-center">
                <Users className="mx-auto h-4 w-4 text-muted-foreground" />
                <div className="mt-2 text-2xl font-semibold tabular-nums">
                  {invitedCount}
                </div>
                <div className="text-xs text-muted-foreground">已邀请</div>
              </div>
              <div className="rounded-lg border border-border p-4 text-center">
                <Coins className="mx-auto h-4 w-4 text-muted-foreground" />
                <div className="mt-2 text-2xl font-semibold tabular-nums">
                  {formatCredits(totalReward)}
                </div>
                <div className="text-xs text-muted-foreground">累计奖励 cr</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">奖励规则</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                好友通过你的链接注册成功，你获得{" "}
                <strong className="text-foreground">
                  {formatCredits(settings.inviterReward)} cr
                </strong>
                ，好友获得{" "}
                <strong className="text-foreground">
                  {formatCredits(settings.inviteeReward)} cr
                </strong>
                （永久余额）。
              </li>
              <li>奖励在注册时直接发放，并记入钱包的充值记录。</li>
              <li>新账号需要邮箱注册，每个账号只能被邀请一次；注册 IP 有频率限制。</li>
              <li>
                同一邀请人 24 小时内最多获得 {INVITE_DAILY_REWARD_LIMIT} 次邀请奖励。
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">最近邀请</CardTitle>
          </CardHeader>
          <CardContent>
            {records.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                还没有邀请记录，把上面的链接分享给朋友吧。
              </p>
            ) : (
              <div className="space-y-2">
                {records.map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {maskEmail(emailMap.get(record.inviteeId) ?? "")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {record.createdAt ? formatCnDate(record.createdAt) : "-"}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-success">
                      +{formatCredits(record.inviterReward)} cr
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
