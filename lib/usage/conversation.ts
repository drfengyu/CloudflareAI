import { db } from "@/lib/db/d1-http";
import { conversationHistory, type ConversationHistory } from "@/lib/db/schema";
import { desc, eq, and, like } from "drizzle-orm";

/** 保存对话到历史记录 */
export async function saveConversation(input: {
  userId: string;
  sessionId?: string;
  model: string;
  prompt: string;
  response: string;
  inputTokens: number;
  outputTokens: number;
  creditsUsed: number;
}) {
  await db.insert(conversationHistory).values({
    userId: input.userId,
    sessionId: input.sessionId,
    model: input.model,
    prompt: input.prompt,
    response: input.response,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    creditsUsed: input.creditsUsed,
  });
}

/** 获取用户的对话历史（分页） */
export async function getConversationHistory(
  userId: string,
  page = 1,
  pageSize = 20,
  search?: string,
): Promise<{ conversations: ConversationHistory[]; total: number }> {
  const offset = (page - 1) * pageSize;

  const conditions = [eq(conversationHistory.userId, userId)];
  if (search) {
    // 搜索 prompt 或 response 包含关键词
    conditions.push(
      // SQLite LIKE is case-insensitive by default
      like(conversationHistory.prompt, `%${search}%`),
    );
  }

  const where = and(...conditions);

  const [conversations, countResult] = await Promise.all([
    db
      .select()
      .from(conversationHistory)
      .where(where)
      .orderBy(desc(conversationHistory.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: conversationHistory.id })
      .from(conversationHistory)
      .where(where),
  ]);

  return { conversations, total: countResult.length };
}

/** 删除单条对话记录 */
export async function deleteConversation(userId: string, conversationId: string) {
  await db
    .delete(conversationHistory)
    .where(
      and(
        eq(conversationHistory.id, conversationId),
        eq(conversationHistory.userId, userId),
      ),
    );
}

/** 清空用户的所有对话历史 */
export async function clearConversationHistory(userId: string) {
  await db
    .delete(conversationHistory)
    .where(eq(conversationHistory.userId, userId));
}
