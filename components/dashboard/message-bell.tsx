"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCnRelativeTime } from "@/lib/date";
import type { MessagePreview } from "@/lib/message/messages";

/**
 * 顶栏铃铛：未读数 + 最近几封。
 *
 * 计数由服务端在布局里算好传进来，点进 /messages 才算读过；这里不自己发请求，
 * 免得每次导航都为了几个数字再打一次 D1。
 */
export function MessageBell({
  unreadCount,
  recent,
}: {
  unreadCount: number;
  recent: MessagePreview[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={unreadCount > 0 ? `站内信，${unreadCount} 封未读` : "站内信"}
        className="relative flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-3.5 rounded-full bg-[color:var(--destructive)] px-1 text-[10px] font-medium leading-[14px] text-white tabular-nums">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between normal-case">
          <span>站内信</span>
          {unreadCount > 0 ? (
            <span className="text-[11px] font-normal text-muted-foreground">
              {unreadCount} 封未读
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {recent.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">还没有收到站内信</p>
        ) : (
          recent.map((m) => (
            <DropdownMenuItem key={m.id} asChild>
              <Link href={`/messages?id=${m.id}`} className="w-full">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {!m.readAt ? (
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--primary)]"
                      />
                    ) : null}
                    <span className="truncate text-sm">{m.title}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">{m.summary}</span>
                    <span className="shrink-0 tabular-nums">
                      {m.createdAt ? formatCnRelativeTime(m.createdAt) : ""}
                    </span>
                  </span>
                </span>
                {m.pendingClaim ? (
                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-[color:var(--primary)]">
                    待领取
                  </span>
                ) : null}
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/messages" className="w-full justify-center text-xs">
            查看全部
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
