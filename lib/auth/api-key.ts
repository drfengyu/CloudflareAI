import crypto from "node:crypto";
import { db } from "@/lib/db/d1-http";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** 生成一个新的 API key（明文，仅显示一次）和它的 SHA-256 哈希 */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const randomBytes = crypto.randomBytes(24);
  const key = `sk-cfai-${randomBytes.toString("base64url")}`;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const prefix = key.slice(0, 16); // "sk-cfai-AbC1..."
  return { key, hash, prefix };
}

/** 根据明文 API key 查找用户 ID（验证哈希） */
export async function verifyApiKey(key: string): Promise<string | null> {
  if (!key.startsWith("sk-cfai-")) return null;

  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .limit(1);

  const apiKey = rows[0];
  if (!apiKey || apiKey.revoked) return null;

  // 更新 lastUsedAt（异步，不阻塞）
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKey.id))
    .then(() => {})
    .catch(console.error);

  return apiKey.userId;
}

/** 从 Authorization 头提取 Bearer token */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] || null;
}
