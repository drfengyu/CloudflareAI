"use client";

import { useState } from "react";
import { Megaphone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { publishKongmingReleaseAnnouncement } from "./actions";
import { KONGMING_RELEASE } from "@/lib/announcements/kongming-release";

/** 发布本版系统公告，并给全部注册用户发活动券补偿站内信（按版本号幂等）。 */
export function ReleaseAnnouncementButton() {
  const [busy, setBusy] = useState(false);

  async function publish() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await publishKongmingReleaseAnnouncement();
      toast.success(
        `${result.version} 公告已发布，补偿 ${result.tickets} 张券，新发 ${result.sent} / ${result.totalUsers} 封`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发布失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border/70 bg-secondary/30 px-3 py-2">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        发布 v{KONGMING_RELEASE.version} 系统公告；按公告 {KONGMING_RELEASE.items.length} 条更新，
        给每位注册用户发 {KONGMING_RELEASE.items.length} 张当期活动券。重复点击不会重复发券。
      </p>
      <button
        type="button"
        onClick={() => void publish()}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-primary/60 hover:text-primary disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
        发布本版公告与补偿
      </button>
    </div>
  );
}
