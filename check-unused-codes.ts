import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "@/lib/db/d1-http";
import { redemptions } from "@/lib/db/schema";

async function checkUnusedCodes() {
  const codes = await db.select().from(redemptions);
  
  console.log("所有兑换码状态:");
  codes.forEach(c => {
    const status = c.usedCount >= (c.maxUses || Infinity) ? '已用完' : 
                   c.expiresAt && new Date(c.expiresAt) < new Date() ? '已过期' : '可用';
    if (status === '可用') {
      console.log(`✅ ${c.code} - ${c.quota} cr - usedCount: ${c.usedCount}/${c.maxUses}`);
    }
  });
}

checkUnusedCodes();
