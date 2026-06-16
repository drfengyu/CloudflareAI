import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "@/lib/db/d1-http";
import { users, temporaryBalances } from "@/lib/db/schema";

async function quickCheck() {
  const user = await db.select().from(users).limit(1);
  const tempBals = await db.select().from(temporaryBalances);
  const now = new Date();
  const validTemp = tempBals.filter(tb => new Date(tb.expiresAt) > now);
  const tempTotal = validTemp.reduce((sum, tb) => sum + tb.amount, 0);
  const total = (user[0]?.balanceCredits || 0) + tempTotal;
  
  console.log("永久余额:", user[0]?.balanceCredits, "cr");
  console.log("临时余额:", tempTotal, "cr");
  console.log("总余额:", total, "cr");
  console.log("状态:", total >= 0 ? "✅ 正数" : "❌ 负数");
}

quickCheck();
