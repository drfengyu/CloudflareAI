// scripts/make-admin.ts
// 将指定用户升级为管理员（role = 100）

import { db } from "@/lib/db/d1-http";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const email = process.argv[2];

if (!email) {
  console.error("Usage: tsx scripts/make-admin.ts <email>");
  process.exit(1);
}

async function makeAdmin() {
  console.log(`\n🔍 查找用户: ${email}`);

  // 查找用户
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user[0]) {
    console.error(`❌ 用户不存在: ${email}`);
    process.exit(1);
  }

  const currentRole = user[0].role || 1;
  console.log(`📋 当前角色: ${currentRole} (1=普通用户, 10=管理员, 100=超管)`);

  if (currentRole >= 100) {
    console.log(`✅ 用户已经是超级管理员`);
    return;
  }

  // 升级为超管
  await db
    .update(users)
    .set({ role: 100 })
    .where(eq(users.id, user[0].id));

  console.log(`✅ 成功升级为超级管理员 (role: ${currentRole} → 100)`);
  console.log(`\n现在可以访问:`);
  console.log(`  - /admin/users`);
  console.log(`  - /admin/redemptions`);
  console.log(`  - /admin/settings`);
}

makeAdmin().catch(console.error);
