import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

async function runMigration() {
  const statements = [
    "ALTER TABLE redemption ADD COLUMN usedUserId TEXT REFERENCES user(id) ON DELETE SET NULL",
    "ALTER TABLE redemption ADD COLUMN redeemedAt INTEGER"
  ];

  console.log(`执行 ${statements.length} 条 SQL 语句...\n`);

  for (const statement of statements) {
    console.log("执行:", statement);
    
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/d1/database/${process.env.CF_D1_DATABASE_ID}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql: statement }),
      }
    );

    const data = await response.json();
    
    if (!data.success) {
      console.error("❌ 失败:", JSON.stringify(data.errors, null, 2));
      // 继续执行下一条（可能字段已存在）
    } else {
      console.log("✅ 成功\n");
    }
  }

  console.log("✅ 迁移完成！");
}

runMigration();
