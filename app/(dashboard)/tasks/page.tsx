import { CalendarDays, CalendarRange, Inbox } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageBody } from "@/components/dashboard/section";
import { TaskBoardCard } from "@/components/tasks/task-board";
import { getTaskSettings } from "@/lib/settings";
import {
  DAILY_TARGET,
  DAILY_TASKS,
  WEEKLY_TARGET,
  WEEKLY_TASKS,
  listTaskBoard,
  type TaskDef,
} from "@/lib/tasks/tasks";
import { requireUser } from "@/lib/usage/meter";

export const dynamic = "force-dynamic";

const sumPoints = (tasks: TaskDef[]): number =>
  tasks.reduce((sum, task) => sum + task.points, 0);

export default async function TasksPage() {
  const userId = await requireUser();
  const settings = await getTaskSettings();
  const board = await listTaskBoard(userId, settings);
  const dailyTotal = sumPoints(DAILY_TASKS);
  const weeklyTotal = sumPoints(WEEKLY_TASKS);

  return (
    <>
      <PageHeader
        title="任务成就"
        description={`每日 ${DAILY_TASKS.length} 项合计 ${dailyTotal} 活跃度 · 每周 ${WEEKLY_TASKS.length} 项合计 ${weeklyTotal} 活跃度 · 达成里程碑自动发站内信`}
      />
      <PageBody className="space-y-4">
        {!settings.enabled && (
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            任务活动当前未开启，进度照常统计；开启后即可领取活跃度，已领过的任务本期不会重复发放。
          </div>
        )}

        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
          <Inbox className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--primary)]" />
          <span>
            完成任务后需要<b className="text-foreground">手动领取活跃度</b>；活跃度跨过里程碑（每日每 25 一档、每周每 50 一档）
            会自动把随机货币奖励发到<b className="text-foreground">站内信</b>，打开站内信领取后才到账。
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4" />
                  每日任务
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {board.daily.periodLabel} · 每天 0 点重置
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <TaskBoardCard view={board.daily} enabled={board.enabled} />
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span className="flex items-center gap-2">
                  <CalendarRange className="h-4 w-4" />
                  每周任务
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {board.weekly.periodLabel} · 周一 0 点重置
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <TaskBoardCard view={board.weekly} enabled={board.enabled} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">规则</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                进度按各功能的真实记录现场统计，<b className="text-foreground">不靠手动打卡</b>：
                做完任务后还要手动点「领取活跃度」，领取后才计入当前周期。
              </li>
              <li>
                每日目标 <b className="text-foreground">{DAILY_TARGET}</b>（任务合计{" "}
                <b className="text-foreground">{dailyTotal}</b>）、每周目标{" "}
                <b className="text-foreground">{WEEKLY_TARGET}</b>（任务合计{" "}
                <b className="text-foreground">{weeklyTotal}</b>）：任务多于目标，允许跳过一个方向不做；
                每日每 25 一档、每周每 50 一档，超过目标的零头不再多算里程碑。
              </li>
              <li>
                奖励以 tcr 发放，{board.validDays} 天内有效，到期未用自动作废。
                站内信里待领取的附件不会被清理。
              </li>
              <li>
                周期按北京时间计算：每日 0 点重置，每周一 0 点重置；跨周期后任务与里程碑都重新开始。
              </li>
            </ul>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
