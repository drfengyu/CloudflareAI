"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { BucketGranularity } from "@/lib/date";

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm";

/**
 * 看板右上角工具条：自定义时段搜索 + 刷新。
 * 时段以 `?from=&to=&gran=` 落到 URL，由服务端算窗口，客户端不碰数据。
 */
export function DashboardToolbar({
  custom,
  from,
  to,
  gran,
}: {
  /** 当前是否处于自定义时段（否则为今日/近 7 日/近 30 日预设） */
  custom: boolean;
  /** 回填表单用，格式 `YYYY-MM-DDTHH:mm` */
  from: string;
  to: string;
  gran: BucketGranularity;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from, to, gran });
  const [pending, startTransition] = useTransition();

  const valid = Boolean(draft.from && draft.to) && draft.from < draft.to;

  const openDialog = () => {
    setDraft({ from, to, gran });
    setOpen(true);
  };

  const apply = () => {
    if (!valid) return;
    const params = new URLSearchParams({
      from: draft.from,
      to: draft.to,
      gran: draft.gran,
    });
    router.push(`/dashboard?${params.toString()}`);
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      {custom ? (
        <button
          type="button"
          onClick={() => router.push("/dashboard?range=today")}
          className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          自定义时段 · 清除
        </button>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <button
          type="button"
          onClick={openDialog}
          title="搜索条件"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Search className="h-4 w-4" />
        </button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>搜索条件</DialogTitle>
            <DialogDescription>时间按北京时间填写，用于自定义统计时段。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="range-from">起始时间</Label>
              <input
                id="range-from"
                type="datetime-local"
                value={draft.from}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                className={FIELD_CLASS}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="range-to">结束时间</Label>
              <input
                id="range-to"
                type="datetime-local"
                value={draft.to}
                onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                className={FIELD_CLASS}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="range-gran">时间粒度</Label>
              <select
                id="range-gran"
                value={draft.gran}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    gran: e.target.value === "hour" ? "hour" : "day",
                  }))
                }
                className={FIELD_CLASS}
              >
                <option value="hour">小时</option>
                <option value="day">天</option>
              </select>
              {!valid ? (
                <p className="text-xs text-[color:var(--warning)]">
                  起始时间需早于结束时间
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              取消
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!valid}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-opacity disabled:opacity-50"
            >
              确定
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        disabled={pending}
        title="刷新数据"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
