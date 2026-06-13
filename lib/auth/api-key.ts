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

/**
 * 根据明文 API key 查找并返回验证后的 { userId, apiKeyId }（Phase B 增强版）。
 * 校验：status=1（启用）、未过期、IP白名单（如有）。
 * 返回 null 表示无效/不通过。
 */
export async function verifyApiKey(
  key: string,
  clientIp?: string,
): Promise<{ userId: string; apiKeyId: string; allowedModels: string[] | null } | null> {
  if (!key.startsWith("sk-cfai-")) return null;

  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .limit(1);

  const apiKey = rows[0];
  if (!apiKey) return null;

  // 状态检查：1=启用
  if (apiKey.status !== 1) return null;

  // 有效期检查
  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    // 过期，标记 status=3（异步）
    db.update(apiKeys)
      .set({ status: 3 })
      .where(eq(apiKeys.id, apiKey.id))
      .then(() => {})
      .catch(console.error);
    return null;
  }

  // IP 白名单检查（如果配置了）
  if (apiKey.allowedIps && clientIp) {
    const allowed = apiKey.allowedIps.split(",").map((ip) => ip.trim());
    if (!allowed.includes(clientIp)) return null;
  }

  // 解析模型白名单
  let allowedModels: string[] | null = null;
  if (apiKey.allowedModels) {
    try {
      allowedModels = JSON.parse(apiKey.allowedModels);
    } catch {
      // 忽略解析错误，按无限制处理
    }
  }

  return {
    userId: apiKey.userId,
    apiKeyId: apiKey.id,
    allowedModels,
  };
}

/** 从 Authorization 头提取 Bearer token */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] || null;
}
