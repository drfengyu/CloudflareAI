import { test, expect } from "@playwright/test";

/**
 * 交互式测试：LinuxDO 登录后验证三个新功能
 * 1. 新用户 2000 cr 奖励
 * 2. 签到 7 天有效期临时余额
 * 3. 设置页面显示 LinuxDO 信息
 *
 * 运行方式：
 *   npx playwright test tests/e2e/linuxdo-flow.spec.ts --headed --project=chromium
 */

const PROD_URL = "https://cloudai.fuwari.fun";

test.describe("LinuxDO 登录后流程验证", () => {
  test.use({ baseURL: PROD_URL });
  // 给用户充足的时间手动完成 OAuth
  test.setTimeout(5 * 60 * 1000);

  test("登录 → 验证余额/设置/签到", async ({ page }) => {
    // 1. 打开登录页
    await page.goto("/login");
    console.log("\n👉 请点击「使用 LinuxDO 继续」并完成 OAuth 授权...\n");

    // 2. 等待跳转回 dashboard（用户完成 OAuth 后）
    await page.waitForURL(/\/dashboard|\/$/, { timeout: 4 * 60 * 1000 });
    console.log("✅ 登录成功，已跳转到 dashboard");

    // ============ 验证 1：钱包页面余额 ============
    await page.goto("/wallet");
    await page.waitForLoadState("networkidle");

    // 截图保留证据
    await page.screenshot({
      path: "tests/e2e/screenshots/wallet-after-login.png",
      fullPage: true,
    });
    console.log("📸 已保存钱包页面截图");

    // 检查余额显示（应至少有 2000 cr，如果是新用户）
    const walletContent = await page.textContent("body");
    console.log("💰 钱包页关键字段：");
    const balanceMatch = walletContent?.match(/([\d,]+)\s*cr/i);
    if (balanceMatch) console.log(`   余额: ${balanceMatch[0]}`);

    // ============ 验证 2：设置页面显示 LinuxDO 信息 ============
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "tests/e2e/screenshots/settings-after-login.png",
      fullPage: true,
    });
    console.log("📸 已保存设置页面截图");

    const settingsBody = await page.textContent("body");
    if (settingsBody?.includes("LinuxDO")) {
      console.log("✅ 设置页显示 LinuxDO 字段");
    } else {
      console.log("⚠️  设置页未检测到 LinuxDO 字段");
    }

    // ============ 验证 3：签到功能 ============
    await page.goto("/wallet");
    await page.waitForLoadState("networkidle");

    // 查找签到按钮
    const checkinBtn = page.getByRole("button", { name: /签到/ }).first();
    const checkinVisible = await checkinBtn.isVisible().catch(() => false);

    if (checkinVisible) {
      const btnText = await checkinBtn.textContent();
      console.log(`🎁 找到签到按钮，文本: "${btnText}"`);

      // 如果已签到，按钮会被禁用
      const isDisabled = await checkinBtn.isDisabled();
      if (isDisabled) {
        console.log("ℹ️  今日已签到");
      } else {
        console.log("👉 执行签到...");
        await checkinBtn.click();
        // 等待 toast 或页面更新
        await page.waitForTimeout(2000);
        await page.screenshot({
          path: "tests/e2e/screenshots/after-checkin.png",
          fullPage: true,
        });
        console.log("📸 已保存签到后截图");

        // 验证临时余额展示 + 7 天文案
        const afterBody = await page.textContent("body");
        if (afterBody?.includes("7 天") || afterBody?.includes("7天") || afterBody?.includes("有效期")) {
          console.log("✅ 检测到「有效期 / 7 天」文案");
        } else {
          console.log("⚠️  未检测到「有效期 / 7 天」文案，请截图人工确认");
        }
      }
    } else {
      console.log("⚠️  未找到签到按钮");
    }

    // ============ 验证 4：充值流水 ============
    const finalBody = await page.textContent("body");
    if (finalBody?.includes("新用户注册奖励")) {
      console.log("✅ 流水显示「新用户注册奖励」");
    }
    if (finalBody?.includes("签到")) {
      console.log("✅ 流水显示签到记录");
    }

    console.log("\n🎉 测试流程完成，请查看截图和控制台输出\n");
  });
});
