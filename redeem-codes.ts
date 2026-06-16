import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

import { db } from "@/lib/db/d1-http";
import { redemptions, users, topups, temporaryBalances } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

const CODES_TO_REDEEM = [
  '4LHXSTRW8Q995NRU',
  'MJ8JBJJ2D9954JK8',
  'QSPPMDBKK7BEWMC8',
  'KNSQCAYS77PG4VDV'
];

async function redeemCodes() {
  const userId = '5c7dcb78-4fe6-407f-89f9-b84eff0f6c77'; // 从之前的查询获取

  console.log('开始兑换码充值...\n');

  for (const code of CODES_TO_REDEEM) {
    console.log(`兑换码: ${code}`);
    
    // 查找兑换码
    const redemption = await db.select().from(redemptions).where(eq(redemptions.code, code)).limit(1);
    if (!redemption[0]) {
      console.log('  ❌ 兑换码不存在\n');
      continue;
    }

    const r = redemption[0];

    // 检查是否已用完
    if (r.usedCount >= (r.maxUses || Infinity)) {
      console.log('  ❌ 兑换码已用完\n');
      continue;
    }

    // 检查是否过期
    if (r.expiresAt && new Date(r.expiresAt) < new Date()) {
      console.log('  ❌ 兑换码已过期\n');
      continue;
    }

    const now = new Date();

    try {
      // 1. 更新兑换码使用次数
      await db.update(redemptions)
        .set({ usedCount: r.usedCount + 1 })
        .where(eq(redemptions.id, r.id));

      // 2. 充值到永久余额（type=1 兑换码充值）
      await db.update(users)
        .set({ balanceCredits: sql`${users.balanceCredits} + ${r.quota}` })
        .where(eq(users.id, userId));

      // 3. 记录充值流水
      await db.insert(topups).values({
        id: crypto.randomUUID(),
        userId,
        amount: r.quota,
        type: 1,
        description: `兑换码充值: ${code}`,
        redemptionId: r.id,
        createdAt: now
      });

      console.log(`  ✅ 成功充值 ${r.quota} cr\n`);
    } catch (error) {
      console.log(`  ❌ 充值失败:`, error);
    }
  }

  // 查看充值后余额
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  console.log('\n充值后余额:');
  console.log('永久余额:', user[0]?.balanceCredits, 'cr');

  // 查看临时余额
  const tempBals = await db.select().from(temporaryBalances).where(eq(temporaryBalances.userId, userId));
  const validTemp = tempBals.filter(tb => new Date(tb.expiresAt) > new Date());
  const tempTotal = validTemp.reduce((sum, tb) => sum + tb.amount, 0);
  console.log('临时余额:', tempTotal, 'cr');
  console.log('总余额:', (user[0]?.balanceCredits || 0) + tempTotal, 'cr');
}

redeemCodes();
