"use client";

import { useState } from "react";
import { MessageSquare, MoreHorizontal, Pin, PinOff, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type SessionListItem = {
  id: string;
  title: string;
  model: string;
  pinned: boolean;
  messageCount: number;
  lastMessageAt: number;
};

function whenAgo(ms: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(ms).toISOString().slice(0, 10);
}

export function SessionList({
  sessions,
  activeId,
  busy,
  onSelect,
  onNew,
  onRename,
  onPin,
  onDelete,
}: {
  sessions: SessionListItem[];
  activeId: string | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <div className="flex h-full w-full flex-col gap-2">
      <Button size="sm" className="w-full justify-center" onClick={onNew} disabled={busy}>
        <MessageSquare className="h-4 w-4" />
        新建对话
      </Button>

      <div className="flex-1 space-y-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            还没有会话，发消息即可自动创建。
          </p>
        ) : null}

        {sessions.map((s) => (
          <div
            key={s.id}
            className={cn(
              "group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-muted/60",
              s.id === activeId ? "bg-muted" : "",
            )}
          >
            {renamingId === s.id ? (
              <>
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && draft.trim()) {
                      onRename(s.id, draft.trim());
                      setRenamingId(null);
                    }
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    if (draft.trim()) onRename(s.id, draft.trim());
                    setRenamingId(null);
                  }}
                >
                  <X className="h-3.5 w-3.5 rotate-45" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onSelect(s.id)}
                >
                  <span className="block truncate text-xs font-medium">
                    {s.pinned ? <Pin className="mr-1 inline h-3 w-3 text-primary" /> : null}
                    {s.title}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {s.messageCount} 条 · {whenAgo(s.lastMessageAt)} · {s.model.split("/").pop()}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setRenamingId(s.id);
                        setDraft(s.title);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      重命名
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onPin(s.id, !s.pinned)}>
                      {s.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                      {s.pinned ? "取消置顶" : "置顶"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(s.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
