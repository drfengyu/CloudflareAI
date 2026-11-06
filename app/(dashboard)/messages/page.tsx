import { PageHeader } from "@/components/dashboard/page-header";
import { PageBody } from "@/components/dashboard/section";
import { requireUser } from "@/lib/usage/meter";
import {
  MESSAGE_PAGE_SIZE,
  listMessages,
  readMessage,
  type InboxFilter,
} from "@/lib/message/messages";
import { MessageInbox } from "./inbox";

export const dynamic = "force-dynamic";

const FILTERS: InboxFilter[] = ["all", "unread", "claimable"];

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; filter?: string; page?: string }>;
}) {
  const userId = await requireUser();
  const params = await searchParams;
  const filter = FILTERS.includes(params.filter as InboxFilter)
    ? (params.filter as InboxFilter)
    : "all";
  const page = Math.max(1, Math.trunc(Number(params.page)) || 1);

  // 铃铛里点进来的信带 ?id=，直接读出来当已选中的那封（readMessage 顺手标已读）。
  const [inbox, detail] = await Promise.all([
    listMessages(userId, filter, page),
    params.id ? readMessage(userId, params.id) : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader title="站内信" description="系统发放的物品、奖励与重要提示" />
      <PageBody>
        <MessageInbox
          initial={{
            rows: inbox.rows,
            total: inbox.total,
            page,
            totalPages: Math.max(1, Math.ceil(inbox.total / MESSAGE_PAGE_SIZE)),
          }}
          initialDetail={detail}
        />
      </PageBody>
    </>
  );
}
