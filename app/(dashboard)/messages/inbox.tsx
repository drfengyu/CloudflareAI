"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Copy, Gift, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PillTab } from "@/components/dashboard/section";
import { Pagination } from "@/components/dashboard/pagination";
import { toast } from "sonner";
import { formatCnWallClock, formatCnRelativeTime } from "@/lib/date";
import { formatCredits } from "@/lib/billing/credits";
import type { InboxPage } from "./actions";
import { claimAttachment, loadInbox, openMessage, removeMessage } from "./actions";
import type {
  Attachment,
  InboxFilter,
  MessageDetail,
  MessagePreview,
} from "@/lib/message/messages";

const FILTER_TABS: { value: InboxFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "unread", label: "未读" },
  { value: "claimable", label: "待领取" },
];

const KIND_LABEL: Record<MessagePreview["kind"], string> = {
  notice: "通知",
  reward: "奖励",
  security: "安全提示",
};

function attachmentLabel(attachment: Attachment, claimed: boolean): string {
  switch (attachment.kind) {
    case "credits":
      return `${formatCredits(attachment.credits)} cr`;
    case "tickets":
      return `${attachment.count} 张抽奖券`;
    case "redemption":
      return claimed && attachment.code ? `兑换码 ${attachment.code}` : "兑换码（领取后可见）";
    case "item":
      return claimed && attachment.label ? attachment.label : "物品 / 凭证（领取后可见）";
    default:
      return "附件";
  }
}

export function MessageInbox({
  initial,
  initialDetail,
}: {
  initial: InboxPage;
  initialDetail: MessageDetail | null;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTER_TABS)[number]["value"]>("all");
  const [rows, setRows] = useState(initial.rows);
  const [total, setTotal] = useState(initial.total);
  const [totalPages, setTotalPages] = useState(initial.totalPages);
  const [page, setPage] = useState(initial.page);
  const [listLoading, setListLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(initialDetail?.id ?? null);
  const [detail, setDetail] = useState(initialDetail);
  const [detailLoading, setDetailLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const refreshList = useCallback(
    async (nextFilter: typeof filter, nextPage: number) => {
      setListLoading(true);
      try {
        const result = await loadInbox(nextFilter, nextPage);
        setRows(result.rows);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        setPage(result.page);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "加载失败");
      } finally {
        setListLoading(false);
      }
    },
    [],
  );

  const pick = async (row: MessagePreview) => {
    setSelectedId(row.id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const opened = await openMessage(row.id);
      setDetail(opened);
      if (!row.readAt) {
        // 读过就是 3 天后清理的起算点，也是未读数的减一，两边都要跟着动。
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, readAt: new Date() } : r)),
        );
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "打开失败");
    } finally {
      setDetailLoading(false);
    }
  };

  const claim = async () => {
    if (!detail) return;
    setClaiming(true);
    try {
      const result = await claimAttachment(detail.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.note);
      setDetail({ ...detail, claimedAt: new Date(), pendingClaim: false, attachment: result.attachment });
      setRows((prev) =>
        prev.map((r) =>
          r.id === detail.id ? { ...r, claimedAt: new Date(), pendingClaim: false } : r,
        ),
      );
      if (filter === "claimable") await refreshList(filter, page);
      router.refresh();
    } finally {
      setClaiming(false);
    }
  };

  const remove = async () => {
    if (!detail) return;
    const gone = await removeMessage(detail.id);
    if (!gone) {
      toast.error("删除失败");
      return;
    }
    toast.success("已删除");
    setDetail(null);
    setSelectedId(null);
    await refreshList(filter, page);
    router.refresh();
  };

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* 左列：主题 + 简述 */}
      <Card className={selectedId ? "hidden md:block" : undefined}>
        <CardContent className="pt-5">
          <div className="mb-4 flex flex-wrap justify-center gap-2">
            {FILTER_TABS.map((t) => (
              <PillTab
                key={t.value}
                active={filter === t.value}
                onClick={() => {
                  setFilter(t.value);
                  void refreshList(t.value, 1);
                }}
              >
                {t.label}
              </PillTab>
            ))}
          </div>

          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {filter === "claimable" ? "没有待领取的附件" : filter === "unread" ? "没有未读的信" : "还没有收到站内信"}
            </p>
          ) : (
            <ul className={listLoading ? "space-y-1 opacity-60" : "space-y-1"}>
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => void pick(row)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-secondary/40 ${
                      selectedId === row.id ? "border-[color:var(--primary)] bg-secondary/30" : "border-border"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {!row.readAt ? (
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--primary)]"
                        />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {row.title}
                      </span>
                      {row.pendingClaim ? (
                        <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-[color:var(--primary)]">
                          待领取
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {row.summary}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                        {row.createdAt ? formatCnRelativeTime(row.createdAt) : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            disabled={listLoading}
            onPageChange={(next) => void refreshList(filter, next)}
          />
          {total > 0 ? (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              共 {total} 封 · 每页 10 条 · 读过满 3 天自动清理（待领取的附件不会被清）
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* 右列：正文 + 领取 */}
      <Card className={selectedId ? undefined : "hidden md:block"}>
        <CardContent className="pt-5">
          {!selectedId ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              选择左侧的一封查看正文
            </p>
          ) : detailLoading ? (
            <p className="py-16 text-center text-sm text-muted-foreground">加载中…</p>
          ) : detail ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="text-xs text-muted-foreground md:hidden"
                >
                  <ChevronLeft className="mr-0.5 inline h-3.5 w-3.5" />
                  返回列表
                </button>
                <h3 className="min-w-0 flex-1 text-base font-semibold">{detail.title}</h3>
                <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {KIND_LABEL[detail.kind]}
                </span>
              </div>

              <p className="text-[11px] text-muted-foreground">
                {detail.createdAt ? formatCnWallClock(detail.createdAt) : ""}
                {detail.sender ? ` · 来自 ${detail.sender}` : " · 系统"}
              </p>

              <div className="whitespace-pre-wrap text-sm leading-6">{detail.body}</div>

              {detail.attachment ? (
                <div className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    <Gift className="h-3.5 w-3.5" />
                    附件：{attachmentLabel(detail.attachment, !!detail.claimedAt)}
                  </p>
                  {detail.claimedAt ? (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      已于 {formatCnWallClock(detail.claimedAt)} 领取
                    </p>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <Button size="sm" onClick={() => void claim()} disabled={claiming}>
                        {claiming ? "领取中..." : "领取"}
                      </Button>
                      <span className="text-[11px] text-muted-foreground">
                        领取后这封信满 3 天自动删除
                      </span>
                    </div>
                  )}
                  {detail.claimedAt && detail.attachment.kind === "redemption" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={async () => {
                        await navigator.clipboard.writeText(detail.attachment?.kind === "redemption" ? detail.attachment.code : "");
                        toast.success("已复制兑换码");
                      }}
                    >
                      <Copy className="h-3 w-3" />
                      复制兑换码
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <div className="flex justify-end border-t border-border pt-3">
                <Button size="sm" variant="outline" onClick={() => void remove()}>
                  <Trash2 className="h-3 w-3" />
                  删除这封
                </Button>
              </div>
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">这封信已被删除</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
