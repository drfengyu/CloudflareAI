import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "@/lib/db/d1-http";
import { users, temporaryBalances } from "@/lib/db/schema";

async function checkDbDirect() {
  console.log("查询所有用户:");
  const allUsers = await db.select().from(users);
  console.table(allUsers.map(u => ({
    name: u.name,
    email: u.email,
    balance: u.balanceCredits,
    role: u.role
  })));
  
  console.log("\n查询所有临时余额:");
  const allTemp = await db.select().from(temporaryBalances);
  console.table(allTemp.map(t => ({
    userId: t.userId.substring(0, 8),
    amount: t.amount,
    expiresAt: new Date(t.expiresAt).toLocaleString(),
    description: t.description
  })));
}

checkDbDirect();
