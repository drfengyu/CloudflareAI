import { test, expect } from "@playwright/test";

test("钱包负数金额显示修复", async ({ page }) => {
  test.setTimeout(60000);
  
  // 登录
  await page.goto("http://localhost:3000/login");
  await page.fill('input[name="email"]', "test@example.com");
  await page.fill('input[name="password"]', "test123456");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");

  // 测试钱包页面
  await page.goto("http://localhost:3000/wallet");
  await page.waitForLoadState("networkidle");

  // 查找充值记录中的"限时活动"条目
  const lotteryRecords = page.locator("text=限时活动");
  const count = await lotteryRecords.count();
  console.log(`找到 ${count} 条限时活动记录`);

  // 检查是否有负数金额显示（不应该有 "+-" 这种格式）
  const badFormat = await page.locator("text=/\\+-\\d+/").count();
  console.log(`错误的 "+-数字" 格式数量: ${badFormat}`);
  expect(badFormat).toBe(0);

  // 检查是否有红色（负数）或绿色（正数）的金额显示
  const successColor = page.locator(".text-success");
  const destructiveColor = page.locator(".text-destructive");
  
  const successCount = await successColor.count();
  const destructiveCount = await destructiveColor.count();
  
  console.log(`绿色金额数量: ${successCount}`);
  console.log(`红色金额数量: ${destructiveCount}`);

  // 截图保存
  await page.screenshot({ path: "test-wallet-amounts.png", fullPage: true });

  console.log("测试完成，截图已保存为 test-wallet-amounts.png");
});
