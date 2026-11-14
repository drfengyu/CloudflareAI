import { Ticket } from "lucide-react";
import { activityCountdown, type ActivityWindow } from "@/lib/activity/window";
import { Countdown } from "./countdown";

/**
 * 玩法页顶部的活动窗口条：剩余时间 + 临期券提醒。
 * 首屏文案由服务端算好，挂载后交给 `Countdown` 每 30 秒刷新；
 * 活动未配置结束时间时整条不渲染，页面不会多出空白。
 */
export function ActivityWindowBadge({
  win,
  tickets,
  couponName,
}: {
  win: ActivityWindow;
  tickets: number;
  couponName: string;
}) {
  const countdown = activityCountdown(win);
  if (!countdown || win.endMs === null) return null;
  const expiring = tickets > 0 && countdown.tone !== "normal";
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground">
      <Countdown endMs={win.endMs} initialText={countdown.text} initialTone={countdown.tone} />
      {expiring ? (
        <span
          className={
            countdown.tone === "urgent"
              ? "inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-destructive"
              : "inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300"
          }
        >
          <Ticket className="h-3 w-3" />
          {couponName}还剩 {tickets} 张，活动结束后作废
        </span>
      ) : null}
    </div>
  );
}
