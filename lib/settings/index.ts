import { db } from "@/lib/db/d1-http";
import { options } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * 获取系统设置值
 * @param key 设置键名
 * @param defaultValue 默认值
 */
export async function getSetting<T = string>(key: string, defaultValue: T): Promise<T> {
  try {
    const rows = await db
      .select({ value: options.value })
      .from(options)
      .where(eq(options.key, key))
      .limit(1);

    if (!rows[0] || rows[0].value === null) {
      return defaultValue;
    }

    const value = rows[0].value;

    // 尝试解析 JSON（对于 boolean、数组、对象等）
    if (typeof defaultValue === "boolean") {
      return (value === "true" || value === "1") as T;
    }

    if (typeof defaultValue === "number") {
      return Number(value) as T;
    }

    if (typeof defaultValue === "object") {
      try {
        return JSON.parse(value) as T;
      } catch {
        return defaultValue;
      }
    }

    return value as T;
  } catch (err) {
    console.error(`[getSetting] Failed to get ${key}:`, err);
    return defaultValue;
  }
}

/**
 * 设置系统配置值
 * @param key 设置键名
 * @param value 设置值
 */
export async function setSetting(key: string, value: string | number | boolean | object): Promise<void> {
  const stringValue = typeof value === "object" ? JSON.stringify(value) : String(value);

  await db
    .insert(options)
    .values({ key, value: stringValue })
    .onConflictDoUpdate({
      target: options.key,
      set: { value: stringValue },
    });
}

/**
 * 获取认证渠道配置
 * 3 个 setting 并行查询，避免串行 3 次 D1 往返。
 */
export async function getAuthChannels() {
  const [emailEnabled, githubEnabled, linuxdoEnabled] = await Promise.all([
    getSetting("auth_email_enabled", true),
    getSetting("auth_github_enabled", true),
    getSetting("auth_linuxdo_enabled", true),
  ]);

  return {
    email: emailEnabled,
    github: githubEnabled,
    linuxdo: linuxdoEnabled,
  };
}
