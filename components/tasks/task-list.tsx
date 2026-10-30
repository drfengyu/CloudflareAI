"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { claimTaskAction } from "@/app/(dashboard)/tasks/actions";
import { Button } from "@/components/ui/button";
import { formatCredits } from "@/lib/billing/credits";
import type { TaskView } from "@/lib/tasks/tasks";

/** 任务清单：进度只读展示，点「领取」后由服务端重算进度再发钱。 */
export function TaskList({ tasks }: { tasks: TaskView[] }) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function onClaim(task: TaskView) {
    if (busyKey) return;
    setBusyKey(task.key);
    const res = await claimTaskAction({ key: task.key });
    setBusyKey(null);
    if (!res.success) {
      toast.error(res.message);
      return;
    }
    toast.success(res.message);
    router.refresh();
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tasks.map((task) => {
        const pct = Math.min(100, Math.round((task.progress / task.target) * 100));
        return (
          <div
            key={task.key}
            className="flex flex-col justify-between rounded-lg border border-border bg-card p-4"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{task.title}</p>
                <span className="shrink-0 text-xs font-semibold text-success tabular-nums">
                  +{formatCredits(task.reward)} cr
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{task.hint}</p>
              {task.target > 1 && !task.claimed ? (
                <div className="mt-3">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-right text-[11px] text-muted-foreground tabular-nums">
                    {Math.min(task.progress, task.target)} / {task.target}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              {task.claimed ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5" />
                  已领取
                </span>
              ) : task.claimable ? (
                <Button size="sm" onClick={() => void onClaim(task)} disabled={busyKey !== null}>
                  {busyKey === task.key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  领取
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
  );
}
