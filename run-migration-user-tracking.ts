import * as dotenv from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });

async function runMigration() {
  const sql = readFileSync("scripts/add-redemption-user-tracking.sql", "utf-8");
  
  // 分割 SQL 语句
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--"));

  console.log(`执行 ${statements.length} 条 SQL 语句...\n`);

  for (const statement of statements) {
    console.log("执行:", statement.substring(0, 100) + "...");
    
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
      console.error("❌ 失败:", data.errors);
      process.exit(1);
    }
    
    console.log("✅ 成功\n");
  }

  console.log("✅ 迁移完成！");
}

runMigration();
