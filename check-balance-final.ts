import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "@/lib/db/d1-http";
import { users, temporaryBalances, topups, redemptions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

async function checkBalanceFinal() {
  const userId = '5c7dcb78-4fe6-407f-89f9-b84eff0f6c77';
  
  // 获取用户余额
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  console.log("\n用户余额:");
  console.log("永久余额:", user[0]?.balanceCredits, "cr");
  
  // 获取临时余额
  const tempBals = await db.select().from(temporaryBalances).where(eq(temporaryBalances.userId, userId));
  const now = new Date();
  const validTemp = tempBals.filter(tb => new Date(tb.expiresAt) > now);
  const tempTotal = validTemp.reduce((sum, tb) => sum + tb.amount, 0);
  console.log("临时余额:", tempTotal, "cr");
  console.log("总余额:", (user[0]?.balanceCredits || 0) + tempTotal, "cr");
  
  console.log("\n临时余额明细:");
  validTemp.forEach(tb => {
    console.log(`- ${tb.amount} cr, 过期: ${new Date(tb.expiresAt).toLocaleDateString()}, 描述: ${tb.description}`);
  });
  
  // 获取最近充值记录
  const recentTopups = await db.select().from(topups).where(eq(topups.userId, userId)).orderBy(desc(topups.createdAt)).limit(3);
  console.log("\n最近3次充值:");
  recentTopups.forEach(t => {
    console.log(`- ${t.amount} cr, ${t.description}, ${new Date(t.createdAt!).toLocaleString()}`);
  });
  
  // 检查兑换码状态
  const codes = await db.select().from(redemptions).where(eq(redemptions.code, 'MJ8JBJJ2D9954JK8')).limit(1);
  if (codes[0]) {
    console.log("\n兑换码 MJ8JBJJ2D9954JK8 状态:");
    console.log("额度:", codes[0].quota, "cr");
    console.log("已使用次数:", codes[0].usedCount);
    console.log("最大使用次数:", codes[0].maxUses);
  }
}

checkBalanceFinal();
