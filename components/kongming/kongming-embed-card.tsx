"use client";

import Link from "next/link";
import { ArrowRight, Gamepad2 } from "lucide-react";

/**
 * 活动中心里的「诸葛孔明传」入口。
 *
 * 与转盘 / 翻牌 / 灵宠工坊一致，直接进入站内 `/kongming` 页面：
 * 顶栏与活动导航保留，游戏画面嵌在活动页正文里，不再以全屏 iframe 遮住站点。
 */
export function KongmingEmbedCard() {
  return (
    <Link
      href="/kongming"
      className="group flex w-full flex-col gap-4 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-card to-card p-5 text-left transition-colors hover:border-primary/50 hover:from-primary/15 sm:flex-row sm:items-center"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-[color:var(--primary)]">
        <Gamepad2 className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold">诸葛孔明传</span>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] text-[color:var(--primary)]">
            新玩法已上线
          </span>
        </span>
        <span className="mt-1 block text-sm text-muted-foreground">
          按 Windows 桌面端复刻 · 徐州起兵 · 序章、场景、战斗与军帐
        </span>
        <span className="mt-1 block text-[11px] text-muted-foreground">
          WASD 移动 · J 确认 · K 取消 / 军帐 · 在活动中心站内打开
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors group-hover:bg-primary/90">
        进入游戏
        <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}
