"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Gamepad2, X } from "lucide-react";

/**
 * 活动中心里的「诸葛孔明传」入口。
 *
 * 点击后不再跳到独立路由，而是在当前页面铺一层内嵌 iframe；独立路由仍保留，
 * 方便直接访问和调试。关掉内嵌层不会丢存档，存档仍在 localStorage。
 */
export function KongmingEmbedCard() {
  const [open, setOpen] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
            WASD 移动 · J 确认 · K 取消 / 军帐 · 点击后在本页内嵌打开
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors group-hover:bg-primary/90">
          进入游戏
          <ArrowRight className="h-4 w-4" />
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-2 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="诸葛孔明传"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="relative flex h-full w-full max-w-[1600px] flex-col overflow-hidden rounded-xl border border-white/15 bg-black shadow-2xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white/80 transition-colors hover:bg-black hover:text-white"
              aria-label="关闭孔明传"
            >
              <X className="h-4 w-4" />
            </button>
            <iframe
              ref={frameRef}
              src="/kongming"
              title="诸葛孔明传"
              className="h-full w-full border-0 bg-black"
              allow="autoplay; fullscreen"
              onLoad={() => frameRef.current?.contentWindow?.focus()}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
