import { CheckCircle2, Coins } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskList } from "@/components/tasks/task-list";
import { formatCredits } from "@/lib/billing/credits";
import { getTaskSettings } from "@/lib/settings";
import { listTasks, taskSummary } from "@/lib/tasks/tasks";
import { requireUser } from "@/lib/usage/meter";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const userId = await requireUser();
  const settings = await getTaskSettings();

  const [tasks, summary] = await Promise.all([
    listTasks(userId, settings),
    taskSummary(userId),
  ]);
  const claimable = tasks.filter((t) => t.claimable);

  return (
    <>
      <PageHeader
        title="任务成就"
        description={`完成即领，每个任务只发一次（临时余额 ${settings.validDays} 天内有效）`}
      />
      <div className="space-y-4 p-8">
        {!settings.enabled && (
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            任务活动当前未开启，进度照常统计；开启后即可领取，已领过的任务不会重复发放。
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">待领取</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-semibold tabular-nums">{claimable.length}</span>
              <span className="text-xs text-muted-foreground">个任务</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">已领任务</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Coins className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-semibold tabular-nums">{summary.claimed}</span>
              <span className="text-xs text-muted-foreground">/ {tasks.length} 个</span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">累计到手</CardTitle>
            </CardHeader>
            <CardContent className="flex items-baseline gap-1">
              <span className="text-2xl font-semibold tabular-nums">
                {formatCredits(summary.credits)}
              </span>
              <span className="text-xs text-muted-foreground">cr</span>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">任务清单</CardTitle>
          </CardHeader>
          <CardContent>
            <TaskList tasks={tasks} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">规则</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>进度按各功能的真实记录现场统计，<b>不靠手动打卡</b>：做完即达标，点「领取」才发钱。</li>
              <li>每个任务只能领一次，奖励进入<b>临时余额</b>，有效期 {settings.validDays} 天，到期未用自动作废。</li>
              <li>「跑通一次 API」只算走 OpenAI / Anthropic 兼容口的成功调用，站内对话与 playground 不计入这一项。</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
