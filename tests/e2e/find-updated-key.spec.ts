import { test } from "@playwright/test";

const BASE_URL = "https://cloudai.fuwari.fun";
const TEST_EMAIL = "drfengling@163.com";
const TEST_PASSWORD = "qq258654357";

test("find and verify the specific key being updated", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[KeySheet]") || text.includes("Debug")) {
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

  // 列出所有 key 的名字
  console.log("\n=== 当前所有 API Keys ===");
  const rows = await page.locator("table tbody tr").all();
  for (let i = 0; i < rows.length; i++) {
    const nameCell = await rows[i].locator("td").first().textContent();
    console.log(`[${i}] ${nameCell}`);
  }

  // 点击第一个 key 编辑
  await page.locator("table tbody tr").first().locator("button").first().click();
  await page.waitForTimeout(500);
  await page.locator('button:has-text("编辑")').click();
  await page.waitForTimeout(1000);

  const nameInput = page.locator('input[type="text"]').first();
  const oldName = await nameInput.inputValue();
  const newName = `TestKey-${Date.now()}`;

  console.log(`\n=== 将 "${oldName}" 改为 "${newName}" ===`);

  await nameInput.fill(newName);
  await page.locator('button:has-text("保存")').last().click();

  // 等待响应
  await page.waitForTimeout(3000);

  // 输出日志
  console.log("\n=== 操作日志 ===");
  for (const log of logs) {
    console.log(log);
  }

  // 提取 keyId
  const debugLog = logs.find(l => l.includes("Debug info"));
  if (debugLog) {
    const match = debugLog.match(/"keyId":"([^"]+)"/);
    if (match) {
      const keyId = match[1];
      console.log(`\n=== 被编辑的 Key ID: ${keyId} ===`);
    }
  }

  // 等待 D1 同步延迟 + 页面跳转
  await page.waitForURL("**/keys**", { timeout: 10000 }).catch(() => {});
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);

  console.log("\n=== 刷新后的所有 Keys ===");
  const rowsAfter = await page.locator("table tbody tr").all();
  for (let i = 0; i < rowsAfter.length; i++) {
    const nameCell = await rowsAfter[i].locator("td").first().textContent();
    console.log(`[${i}] ${nameCell}`);
    if (nameCell?.includes(newName)) {
      console.log(`  ✅ 找到了！新名字已生效`);
    }
  }
});
