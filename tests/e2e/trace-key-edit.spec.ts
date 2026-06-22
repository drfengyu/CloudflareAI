import { test, expect } from "@playwright/test";

const BASE_URL = "https://cloudai.fuwari.fun";
const TEST_EMAIL = "drfengling@163.com";
const TEST_PASSWORD = "qq258654357";

test("trace full key edit flow with network", async ({ page }) => {
  // 收集所有网络请求
  const requests: { url: string; method: string; status: number; body?: string }[] = [];

  page.on("response", async (res) => {
    const url = res.url();
    if (url.includes("/keys") || url.includes("action")) {
      let body = "";
      try { body = (await res.text()).slice(0, 500); } catch {}
      requests.push({ url, method: res.request().method(), status: res.status(), body });
    }
  });

  // 收集所有 console 消息
  const consoleLogs: string[] = [];
  page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

  // 登录
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/邮箱|Email/i).fill(TEST_EMAIL);
  await page.getByLabel(/密码|Password/i).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /登录|Login|Sign in/i }).click();
  await page.waitForURL(/dashboard|keys|playground/, { timeout: 10000 });

  // 进入 keys 页面
  await page.goto(`${BASE_URL}/keys`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // 获取第一个 key 的当前名字
  const firstCell = page.locator("table tbody tr").first().locator("td").first();
  const nameBefore = await firstCell.textContent();
  console.log(`\n=== BEFORE: "${nameBefore}" ===\n`);

  // 点击三个点按钮
  const moreBtn = page.locator("table tbody tr").first().locator('button[aria-label="更多操作"]').or(
    page.locator("table tbody tr").first().locator("button").first()
  );
  await moreBtn.click();
  await page.waitForTimeout(500);

  // 点击"编辑"
  await page.locator('button:has-text("编辑")').click();
  await page.waitForTimeout(1000);

  // 修改名称
  const nameInput = page.locator('input[type="text"]').first();
  const oldValue = await nameInput.inputValue();
  console.log(`Input old value: "${oldValue}"`);

  const newName = `TestKey-${Date.now()}`;
  await nameInput.fill(newName);

  const newValue = await nameInput.inputValue();
  console.log(`Input new value: "${newValue}"`);

  // 清空网络请求记录
  requests.length = 0;
  consoleLogs.length = 0;

  // 点击保存
  await page.locator('button:has-text("保存")').last().click();
  console.log("=== Clicked save ===");

  // 等待响应
  await page.waitForTimeout(5000);

  // 输出所有 console 日志
  console.log("\n=== Console Logs ===");
  for (const log of consoleLogs) {
    console.log(log);
  }

  // 输出所有网络请求
  console.log("\n=== Network Requests ===");
  for (const req of requests) {
    console.log(`${req.method} ${req.status} ${req.url.slice(0, 120)}`);
    if (req.body) console.log(`  Body: ${req.body.slice(0, 200)}`);
  }

  // 检查保存后的页面
  await page.waitForTimeout(2000);
  const nameAfter = await page.locator("table tbody tr").first().locator("td").first().textContent().catch(() => "N/A");
  console.log(`\n=== AFTER: "${nameAfter}" ===`);
  console.log(`=== Expected: contains "${newName}" ===`);
  console.log(`=== Match: ${nameAfter?.includes(newName)} ===`);
});
