"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  countdownTone,
  formatRemaining,
  type CountdownTone,
} from "@/lib/activity/window";

/**
 * 活动倒计时：首屏用服务端算好的文案，挂载后再按浏览器时钟每 30 秒刷新，
 * 避免水合前后文本不一致。活动结束只显示「已结束」，不会倒着走。
 */

const TONE_STYLE: Record<CountdownTone, string> = {
  normal: "border-border bg-secondary/50 text-muted-foreground",
  soon: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  urgent: "border-destructive/40 bg-destructive/10 text-destructive",
};

export function Countdown({
  endMs,
  initialText,
  initialTone,
  className,
}: {
  endMs: number;
  initialText: string;
  initialTone: CountdownTone;
  className?: string;
}) {
  const [view, setView] = useState({ text: initialText, tone: initialTone });

  useEffect(() => {
    const tick = () => {
      const msLeft = Math.max(0, endMs - Date.now());
      setView({ text: formatRemaining(msLeft), tone: countdownTone(msLeft) });
    };
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [endMs]);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] tabular-nums",
        TONE_STYLE[view.tone],
        className,
      )}
    >
      {view.text === "已结束" ? view.text : `剩余 ${view.text}`}
    </span>
  );
}
