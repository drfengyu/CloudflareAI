import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "@/lib/db/d1-http";
import { redemptions, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function checkRedemptions() {
  // 查看可用的兑换码
  const codes = await db.select().from(redemptions).limit(20);
  
  console.log("\n所有兑换码:");
  console.table(codes.map(c => ({
    code: c.code,
    type: c.type,
    quota: c.quota,
    usedCount: c.usedCount,
    maxUses: c.maxUses,
    status: c.usedCount >= (c.maxUses || Infinity) ? '已用完' : 
            c.expiresAt && new Date(c.expiresAt) < new Date() ? '已过期' : '可用'
  })));

  // 查看当前用户余额
  const user = await db.select().from(users).limit(1);
  console.log("\n当前用户余额:");
  console.log("永久余额:", user[0]?.balanceCredits, "cr");
}

checkRedemptions();
