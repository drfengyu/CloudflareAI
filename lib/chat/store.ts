import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/d1-http";
import {
  chatMessages,
  chatSessions,
  type ChatMessage,
  type ChatSession,
} from "@/lib/db/schema";

/** 列表取最近 50 条；站内用户量小，不做游标分页。 */
const SESSION_LIST_LIMIT = 50;
export const DEFAULT_TITLE = "新对话";
const TITLE_MAX_CHARS = 24;

export type SessionListItem = ChatSession & { messageCount: number };

export function titleFromContent(content: string): string {
  const plain = content.replace(/\s+/g, " ").trim();
  if (!plain) return DEFAULT_TITLE;
  return plain.length > TITLE_MAX_CHARS ? `${plain.slice(0, TITLE_MAX_CHARS)}…` : plain;
}

export async function createSession(input: {
  userId: string;
  model: string;
  title?: string;
  systemPrompt?: string | null;
}): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(chatSessions).values({
    id,
    userId: input.userId,
    model: input.model,
    title: input.title?.trim() || DEFAULT_TITLE,
    systemPrompt: input.systemPrompt ?? null,
    pinned: 0,
    createdAt: now,
    lastMessageAt: now,
  });
  return id;
}

/** 消息条数用一条 GROUP BY 补齐再手动映射——drizzle 的相关子查询在本库不可靠。 */
export async function listSessions(userId: string): Promise<SessionListItem[]> {
  const sessions = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.userId, userId))
    .orderBy(desc(chatSessions.pinned), desc(chatSessions.lastMessageAt))
    .limit(SESSION_LIST_LIMIT);

  if (sessions.length === 0) return [];

  const counts = await db
    .select({ sessionId: chatMessages.sessionId, n: sql<number>`COUNT(*)` })
    .from(chatMessages)
    .where(inArray(chatMessages.sessionId, sessions.map((s) => s.id)))
    .groupBy(chatMessages.sessionId);
  const countMap = new Map(counts.map((c) => [c.sessionId, Number(c.n)]));

  return sessions.map((s) => ({ ...s, messageCount: countMap.get(s.id) ?? 0 }));
}

export async function getSession(
  userId: string,
  sessionId: string,
): Promise<ChatSession | undefined> {
  const rows = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
    .limit(1);
  return rows[0];
}

/** 所有权由调用方先用 `getSession` 校验。 */
export async function listMessages(sessionId: string): Promise<ChatMessage[]> {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.seq));
}

async function nextSeq(sessionId: string): Promise<number> {
  const rows = await db
    .select({ seq: sql<number>`COALESCE(MAX(${chatMessages.seq}), 0) + 1` })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId));
  return Number(rows[0]?.seq ?? 1);
}

/**
 * 追加一条消息并返回 `seq`。
 * D1 无事务，seq 先读后写；并发撞车由 `uq_chat_message_seq` 拒绝后重算重试。
 */
export async function appendMessage(input: {
  sessionId: string;
  role: ChatMessage["role"];
  content: string;
  model?: string | null;
  reasoning?: string | null;
  creditsUsed?: number;
}): Promise<number> {
  const now = new Date();
  let lastErr: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    const seq = await nextSeq(input.sessionId);
    try {
      await db.insert(chatMessages).values({
        id: crypto.randomUUID(),
        sessionId: input.sessionId,
        seq,
        role: input.role,
        content: input.content,
        model: input.model ?? null,
        reasoning: input.reasoning ?? null,
        creditsUsed: input.creditsUsed ?? 0,
        createdAt: now,
      });
    } catch (err) {
      lastErr = err;
      continue;
    }

    await db
      .update(chatSessions)
      .set({ lastMessageAt: now })
      .where(eq(chatSessions.id, input.sessionId));

    if (input.role === "user") await titleDefaultedSession(input.sessionId, input.content);
    return seq;
  }

  throw new Error(`appendMessage 连续三次拿不到空闲 seq：${String(lastErr)}`);
}

/** 首条用户消息把「新对话」换成内容摘要；已被手动改名过则不动。 */
async function titleDefaultedSession(sessionId: string, content: string): Promise<void> {
  const title = titleFromContent(content);
  if (title === DEFAULT_TITLE) return;
  await db
    .update(chatSessions)
    .set({ title })
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.title, DEFAULT_TITLE)));
}

/** 从 `seq`（含）起删除，用于「重新生成」；lastMessageAt 回拨到剩下的最后一条。 */
export async function deleteMessagesFrom(sessionId: string, seq: number): Promise<void> {
  await db
    .delete(chatMessages)
    .where(and(eq(chatMessages.sessionId, sessionId), sql`${chatMessages.seq} >= ${seq}`));

  const tail = await db
    .select({ createdAt: chatMessages.createdAt })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(desc(chatMessages.seq))
    .limit(1);

  await db
    .update(chatSessions)
    .set({ lastMessageAt: tail[0]?.createdAt ?? new Date() })
    .where(eq(chatSessions.id, sessionId));
}

export async function renameSession(
  userId: string,
  sessionId: string,
  title: string,
): Promise<boolean> {
  const clean = title.trim().slice(0, 80);
  if (!clean) return false;
  await db
    .update(chatSessions)
    .set({ title: clean })
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)));
  return true;
}

export async function setSessionPinned(
  userId: string,
  sessionId: string,
  pinned: boolean,
): Promise<void> {
  await db
    .update(chatSessions)
    .set({ pinned: pinned ? 1 : 0 })
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)));
}

export async function setSessionSettings(
  userId: string,
  sessionId: string,
  patch: { model?: string; systemPrompt?: string | null },
): Promise<void> {
  await db
    .update(chatSessions)
    .set(patch)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)));
}

/** `chat_message.sessionId` 是级联外键，删会话即带走全部消息。 */
export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  await db
    .delete(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)));
}

/** 返回删除的会话数（按会话级联带走消息）。 */
export async function clearSessions(userId: string): Promise<number> {
  const sessions = await db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(eq(chatSessions.userId, userId));
  if (sessions.length === 0) return 0;
  await db.delete(chatSessions).where(eq(chatSessions.userId, userId));
  return sessions.length;
}
