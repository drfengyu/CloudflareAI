import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "@/lib/db/d1-http";
import { topups, redemptions } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

async function checkTopups() {
  console.log("最近10次充值记录:");
  const recent = await db.select().from(topups).orderBy(desc(topups.createdAt)).limit(10);
  console.table(recent.map(t => ({
    amount: t.amount,
    type: t.type,
    description: t.description?.substring(0, 40),
    redemptionId: t.redemptionId?.substring(0, 8),
    createdAt: new Date(t.createdAt!).toLocaleString()
  })));
  
  console.log("\n检查兑换码 MJ8JBJJ2D9954JK8:");
  const code = await db.select().from(redemptions).where(eq(redemptions.code, 'MJ8JBJJ2D9954JK8')).limit(1);
  if (code[0]) {
    console.log("quota:", code[0].quota);
    console.log("usedCount:", code[0].usedCount);
    console.log("maxUses:", code[0].maxUses);
    console.log("状态:", code[0].usedCount >= (code[0].maxUses || Infinity) ? '已用完' : '可用');
  }
}

checkTopups();
