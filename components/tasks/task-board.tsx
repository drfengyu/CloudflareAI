"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { claimTaskAction } from "@/app/(dashboard)/tasks/actions";
import { Button } from "@/components/ui/button";
import type { TaskPeriodView, TaskView } from "@/lib/tasks/tasks";

/** 一个周期（每日 / 每周）的任务与活跃度里程碑；领取只加活跃度，奖励由里程碑自动发信。 */
export function TaskBoardCard({
  view,
  enabled,
}: {
  view: TaskPeriodView;
  enabled: boolean;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const pct = Math.min(100, Math.round((view.points / view.target) * 100));

  async function onClaim(task: TaskView) {
    if (busyKey) return;
    setBusyKey(task.key);
    const res = await claimTaskAction({ period: view.period, key: task.key });
    setBusyKey(null);
    if (!res.success) {
      toast.error(res.message);
      return;
    }
    toast.success(res.message);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-secondary/30 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-muted-foreground">本期活跃度</span>
          <span className="text-lg font-semibold tabular-nums">
            {view.points}
            <span className="text-xs font-normal text-muted-foreground"> / {view.target}</span>
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {view.milestones.map((milestone) => (
            <div
              key={milestone.points}
              className={`rounded-lg border px-2 py-1.5 text-center ${
                milestone.met ? "border-primary/30 bg-primary/5" : "border-border bg-card"
              }`}
            >
              <p className="flex items-center justify-center gap-1 text-sm font-semibold tabular-nums">
                {milestone.claimState !== "none" ? <Check className="h-3 w-3" /> : null}
                {milestone.points}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {milestone.rewardLabel ?? `${milestone.min}–${milestone.max} tcr`}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {milestone.claimState === "claimed"
                  ? "已领取"
                  : milestone.claimState === "sent"
                    ? "待领取"
                    : milestone.met
                      ? "已达成"
                      : "未达成"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {view.tasks.map((task) => {
          const taskPct = Math.min(100, Math.round((task.progress / task.target) * 100));
          return (
            <div
              key={task.key}
              className="flex flex-col justify-between rounded-lg border border-border bg-card p-3"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{task.title}</p>
                  <span className="shrink-0 text-xs font-semibold text-success tabular-nums">
                    +{task.points} 活跃
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{task.hint}</p>
                {task.target > 1 && !task.claimed ? (
                  <div className="mt-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${taskPct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-right text-[11px] text-muted-foreground tabular-nums">
                      {Math.min(task.progress, task.target)} / {task.target}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                {task.claimed ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5" />
                    已领取
                  </span>
                ) : task.claimable ? (
                  <Button size="sm" disabled={busyKey !== null || !enabled} onClick={() => void onClaim(task)}>
                    {busyKey === task.key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    领取活跃度
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">{task.note || "未达成"}</span>
                )}
                {!task.claimed ? (
                  <Link
                    href={task.href}
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    去完成
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
