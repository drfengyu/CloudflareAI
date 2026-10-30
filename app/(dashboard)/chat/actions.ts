"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/usage/meter";
import {
  appendMessage,
  clearSessions,
  createSession,
  deleteMessagesFrom,
  deleteSession,
  renameSession,
  getSession,
  setSessionPinned,
  setSessionSettings,
} from "@/lib/chat/store";

async function ownedSessionId(userId: string, sessionId: string): Promise<void> {
  const session = await getSession(userId, sessionId);
  if (!session) throw new Error("会话不存在或不属于当前用户");
}

export async function createSessionAction(input: {
  model: string;
  title?: string;
  systemPrompt?: string | null;
}): Promise<{ id: string }> {
  const userId = await requireUser();
  if (!input.model) throw new Error("请先选择模型");
  const id = await createSession({
    userId,
    model: input.model,
    title: input.title,
    systemPrompt: input.systemPrompt ?? null,
  });
  revalidatePath("/chat");
  return { id };
}

export async function renameSessionAction(input: {
  sessionId: string;
  title: string;
}): Promise<void> {
  const userId = await requireUser();
  await ownedSessionId(userId, input.sessionId);
  await renameSession(userId, input.sessionId, input.title);
  revalidatePath("/chat");
}

export async function pinSessionAction(input: {
  sessionId: string;
  pinned: boolean;
}): Promise<void> {
  const userId = await requireUser();
  await ownedSessionId(userId, input.sessionId);
  await setSessionPinned(userId, input.sessionId, input.pinned);
  revalidatePath("/chat");
}

export async function deleteSessionAction(input: { sessionId: string }): Promise<void> {
  const userId = await requireUser();
  await ownedSessionId(userId, input.sessionId);
  await deleteSession(userId, input.sessionId);
  revalidatePath("/chat");
}

export async function clearSessionsAction(): Promise<{ removed: number }> {
  const userId = await requireUser();
  const removed = await clearSessions(userId);
  revalidatePath("/chat");
  return { removed };
}

export async function updateSessionSettingsAction(input: {
  sessionId: string;
  model?: string;
  systemPrompt?: string | null;
}): Promise<void> {
  const userId = await requireUser();
  await ownedSessionId(userId, input.sessionId);
  await setSessionSettings(userId, input.sessionId, {
    model: input.model,
    systemPrompt: input.systemPrompt,
  });
  revalidatePath("/chat");
}

/**
 * 一轮对话结束后落库（用量与扣费已在 /api/ai/text 里完成）。
 * - 普通发送：带 `userContent`，追加一问一答；
 * - 重新生成：`userContent` 传 null，`truncateFromSeq` 指向旧回答的 seq；
 * - 编辑重发：`truncateFromSeq` 指向被改的那条用户消息，并带上新的 `userContent`。
 */
export async function persistTurnAction(input: {
  sessionId: string;
  model: string;
  userContent: string | null;
  assistantContent: string;
  reasoning?: string | null;
  truncateFromSeq?: number;
}): Promise<{ userSeq: number | null; assistantSeq: number }> {
  const userId = await requireUser();
  await ownedSessionId(userId, input.sessionId);

  if (input.truncateFromSeq !== undefined) {
    await deleteMessagesFrom(input.sessionId, input.truncateFromSeq);
  }

  let userSeq: number | null = null;
  if (input.userContent) {
    userSeq = await appendMessage({
      sessionId: input.sessionId,
      role: "user",
      content: input.userContent,
      model: input.model,
    });
  }
  const assistantSeq = await appendMessage({
    sessionId: input.sessionId,
    role: "assistant",
    content: input.assistantContent,
    model: input.model,
    reasoning: input.reasoning ?? null,
  });

  revalidatePath("/chat");
  return { userSeq, assistantSeq };
}
