"use server";

import { requireUser } from "@/lib/usage/meter";
import {
  MESSAGE_PAGE_SIZE,
  claimMessage,
  deleteMessage,
  listMessages,
  readMessage,
  type Attachment,
  type InboxFilter,
  type MessageDetail,
  type MessagePreview,
} from "@/lib/message/messages";

export type InboxPage = {
  rows: MessagePreview[];
  total: number;
  totalPages: number;
  page: number;
};

const FILTERS: InboxFilter[] = ["all", "unread", "claimable"];

/** 收件箱某一页（局部刷新，不改 URL）。 */
export async function loadInbox(filter: InboxFilter, page: number): Promise<InboxPage> {
  const userId = await requireUser();
  const safeFilter = FILTERS.includes(filter) ? filter : "all";
  const { rows, total } = await listMessages(userId, safeFilter, page);
  return {
    rows,
    total,
    page: Math.max(1, Math.trunc(page) || 1),
    totalPages: Math.max(1, Math.ceil(total / MESSAGE_PAGE_SIZE)),
  };
}

/** 打开一封：服务端顺手标记已读，返回正文与附件。 */
export async function openMessage(id: string): Promise<MessageDetail | null> {
  const userId = await requireUser();
  return readMessage(userId, id);
}

export async function claimAttachment(
  id: string,
): Promise<{ ok: true; attachment: Attachment; note: string } | { ok: false; error: string }> {
  const userId = await requireUser();
  try {
    const { attachment, note } = await claimMessage(userId, id);
    return { ok: true, attachment, note };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "领取失败" };
  }
}

export async function removeMessage(id: string): Promise<boolean> {
  const userId = await requireUser();
  return deleteMessage(userId, id);
}
