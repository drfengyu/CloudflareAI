/**
 * 修复历史充值记录描述文本
 * 将描述中的 +50000 替换为 +500，使其与实际金额一致
 *
 * 使用方法：
 * npx tsx scripts/fix-topup-description.ts
 */

import { db } from "@/lib/db/d1-http";
import { topups } from "@/lib/db/schema";
import { sql, eq, and, like } from "drizzle-orm";

async function fixTopupDescription() {
  console.log("开始修复充值记录描述...");

  try {
    // 查找需要修复的记录
    const needFix = await db
      .select()
      .from(topups)
      .where(sql`${topups.description} LIKE '%+50000%' AND ${topups.amount} = 500`);

    console.log(`找到 ${needFix.length} 条需要修复的记录`);

    // 逐条更新
    let fixedCount = 0;
    for (const record of needFix) {
      const newDescription = record.description?.replace('+50000', '+500');
      if (newDescription && newDescription !== record.description) {
        await db
          .update(topups)
          .set({ description: newDescription })
          .where(eq(topups.id, record.id));
        fixedCount++;
      }
    }

    console.log(`✅ 修复完成，共修复 ${fixedCount} 条记录`);

    // 查看修复结果
    const fixed = await db
      .select()
      .from(topups)
      .where(eq(topups.amount, 500))
      .limit(5);

    console.log("\n修复后的记录:");
    console.table(fixed.map(r => ({
      id: r.id.substring(0, 8),
      amount: r.amount,
      description: r.description,
    })));
  } catch (error) {
    console.error("❌ 修复失败:", error);
    process.exit(1);
  }
}

fixTopupDescription();
