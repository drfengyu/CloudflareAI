import { test } from "@playwright/test";

const BASE_URL = "https://cloudai.fuwari.fun";
const TEST_EMAIL = "drfengling@163.com";
const TEST_PASSWORD = "qq258654357";

test("verify database actually updates", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[updateApiKeyAction]") || text.includes("[KeySheet]")) {
      logs.push(text);
    }
  });

  // 登录
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel(/邮箱|Email/i).fill(TEST_EMAIL);
  await page.getByLabel(/密码|Password/i).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /登录|Login|Sign in/i }).click();
  await page.waitForURL(/dashboard|keys|playground/, { timeout: 10000 });

  // 进入 keys 页面
  await page.goto(`${BASE_URL}/keys`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // 记录初始名称
  const nameBefore = await page.locator("table tbody tr").first().locator("td").first().textContent();
  console.log(`\n=== 初始名称: "${nameBefore}" ===`);

  // 点击编辑
  await page.locator("table tbody tr").first().locator("button").first().click();
  await page.waitForTimeout(500);
  await page.locator('button:has-text("编辑")').click();
  await page.waitForTimeout(1000);

  // 修改名称
  const nameInput = page.locator('input[type="text"]').first();
  const oldName = await nameInput.inputValue();
  const newName = `DBTest-${Date.now()}`;

  console.log(`=== 修改: "${oldName}" → "${newName}" ===`);

  await nameInput.fill(newName);

  // 点击保存
  await page.locator('button:has-text("保存")').last().click();

  // 等待足够长的时间让所有日志输出
  await page.waitForTimeout(3000);

  // 输出所有捕获的日志
  console.log("\n=== Server/Client 日志 ===");
  for (const log of logs) {
    console.log(log);
  }

  // 检查返回的版本号
  const versionLog = logs.find(l => l.includes("Update result"));
  if (versionLog) {
    const hasVersion = versionLog.includes("version");
    console.log(`\n=== 服务端版本标识: ${hasVersion ? "✅ v2.0.1 (新)" : "❌ 无 (旧)"} ===`);
  }

  // 检查是否有 "Database updated successfully"
  const hasDbUpdate = logs.some(l => l.includes("Database updated successfully"));
  console.log(`\n=== 数据库更新日志: ${hasDbUpdate ? "✅ 找到" : "❌ 未找到"} ===`);

  // 检查是否有 success: true
  const hasSuccess = logs.some(l => l.includes("success: true"));
  console.log(`=== 返回成功: ${hasSuccess ? "✅ 是" : "❌ 否"} ===`);

  // 等待页面加载（如果有跳转）
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // 检查当前 URL
  const currentUrl = page.url();
  console.log(`\n=== 当前 URL: ${currentUrl} ===`);

  // 尝试读取表格内容
  const nameAfter = await page.locator("table tbody tr").first().locator("td").first().textContent().catch(() => "无法读取");
  console.log(`=== 当前名称: "${nameAfter}" ===`);
  console.log(`=== 是否包含新名称: ${nameAfter?.includes(newName) ? "✅ 是" : "❌ 否"} ===`);

  // 等待 D1 同步（Cloudflare D1 通过 HTTP API 可能有延迟）
  console.log("\n=== 等待 10 秒让 Cloudflare D1 同步... ===");
  await page.waitForTimeout(10000);

  // 手动刷新页面再检查一次
  console.log("\n=== 手动刷新后再检查 ===");
  await page.goto(`${BASE_URL}/keys`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const nameAfterManualRefresh = await page.locator("table tbody tr").first().locator("td").first().textContent().catch(() => "无法读取");
  console.log(`=== 刷新后名称: "${nameAfterManualRefresh}" ===`);
  console.log(`=== 是否包含新名称: ${nameAfterManualRefresh?.includes(newName) ? "✅ 是" : "❌ 否"} ===`);
});
