import { eq, sql } from "drizzle-orm";
import { db } from "./d1-http";
import { users, topups, type User } from "./schema";

/** LinuxDO OAuth 用户信息 */
export interface LinuxDOProfile {
  id: number;
  username: string;
  name: string;
  trust_level: number;
  avatar_template?: string;
}

/** 根据 LinuxDO ID 查找用户 */
export async function getUserByLinuxDOId(linuxdoId: string): Promise<User | undefined> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.linuxdoId, linuxdoId))
    .limit(1);
  return rows[0];
}

/**
 * 创建或获取 LinuxDO OAuth 用户
 * - 检查信任等级（默认 ≥1）
 * - 存在则更新信任等级，不存在则创建
 * - 创建时发放 2000 credits 新人奖励
 */
export async function createOrGetLinuxDOUser(profile: LinuxDOProfile): Promise<string> {
  // 1. 检查信任等级
  const minTrustLevel = parseInt(process.env.LINUXDO_MIN_TRUST_LEVEL || "1");
  if (profile.trust_level < minTrustLevel) {
    throw new Error(
      `LinuxDO 信任等级不足（当前 TL${profile.trust_level}，需要 TL${minTrustLevel}）`
    );
  }

  // 2. 查找现有用户
  const existing = await getUserByLinuxDOId(profile.id.toString());
  if (existing) {
    // 更新信任等级
    await db
      .update(users)
      .set({ linuxdoTrustLevel: profile.trust_level })
      .where(eq(users.id, existing.id));
    return existing.id;
  }

  // 3. 检查是否为首个用户
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .limit(1);
  const isFirstUser = (countResult[0]?.count ?? 0) === 0;

  // 4. 创建新用户
  const id = crypto.randomUUID();
  const WELCOME_BONUS = 2000;

  await db.insert(users).values({
    id,
    email: `linuxdo_${profile.id}@placeholder.local`, // 占位邮箱
    passwordHash: "", // LinuxDO 用户无密码
    name: profile.name || profile.username,
    linuxdoId: profile.id.toString(),
    linuxdoTrustLevel: profile.trust_level,
    role: isFirstUser ? 100 : 1, // 首个用户 → 超管
    balanceCredits: WELCOME_BONUS,
    status: 1,
  });

  // 5. 记录充值流水
  await db.insert(topups).values({
    id: crypto.randomUUID(),
    userId: id,
    amount: WELCOME_BONUS,
    type: 4, // 4=其他（新用户奖励）
    description: "新用户注册奖励（LinuxDO）",
    createdAt: new Date(),
  });

  return id;
}
