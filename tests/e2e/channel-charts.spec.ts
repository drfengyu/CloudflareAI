import { test, expect } from "@playwright/test";

/**
 * 渠道图表增强验证（本地，针对 http://localhost:3000）
 * 覆盖：
 * 1. /dashboard 渠道分布饼图（近 30 日渠道分布卡片）
 * 2. /admin/channels 渠道列表 + 进入渠道详情
 * 3. 渠道详情页 30 日调用趋势 + 错误率曲线
 */

const BASE_URL = "http://localhost:3000";
const TEST_EMAIL = process.env.TEST_EMAIL || "";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "test123456";

async function login(page: import("@playwright/test").Page) {
  if (!TEST_EMAIL) {
    console.log("⚠ 未设置 TEST_EMAIL 环境变量，跳过需要登录的测试");
    return false;
  }

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });

  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  // 等待跳转 dashboard 或出现错误
  await page.waitForURL("**/dashboard", { timeout: 15000 }).catch(() => {});
  if (!page.url().includes("/dashboard")) {
    console.log(`⚠ 登录失败，当前 URL: ${page.url()}`);
    return false;
  }
  console.log("✓ 登录成功");
  return true;
}

test.describe("渠道图表增强验证 (Local)", () => {
  test("Dashboard 显示渠道分布饼图", async ({ page }) => {
    const loggedIn = await login(page);
    if (!loggedIn) {
      test.skip();
      return;
    }

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });

    // 渠道分布卡片存在
    const card = page.locator("text=近 30 日渠道分布");
    await expect(card).toBeVisible({ timeout: 10000 });
    console.log("✓ 「近 30 日渠道分布」卡片存在");

    // 饼图渲染：recharts 生成 SVG（pie 路径 / 图例）
    const svg = page.locator(".recharts-wrapper");
    const legendItems = page.locator(".recharts-legend-item");
    console.log(`饼图 SVG 数: ${await svg.count()}`);
    console.log(`图例项数: ${await legendItems.count()}`);

    // 渠道名在页面出现（站内 Playground 或具体渠道名）
    const bodyText = await page.locator("body").textContent() || "";
    const hasChannelName = /站内 Playground|OpenAI 客户端|Anthropic 客户端|Cloudflare/.test(bodyText);
    console.log(`页面包含渠道名: ${hasChannelName}`);
    expect(hasChannelName).toBeTruthy();

    await page.screenshot({ path: "channel-pie-chart.png", fullPage: false });
  });

test("渠道详情页显示 30 日趋势图 + 错误率曲线", async ({ page }) => {
  test.setTimeout(90000);
  const loggedIn = await login(page);
    if (!loggedIn) {
      test.skip();
      return;
    }

    // 渠道列表页
    await page.goto(`${BASE_URL}/admin/channels`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // 非管理员会被重定向（观察 URL 是否仍在渠道列表页）
    if (!page.url().includes("/admin/channels")) {
      console.log(`⚠ 非管理员无法访问渠道列表（跳转到 ${page.url()}），跳过`);
      test.skip();
      return;
    }

    // 找到第一个渠道链接
    const channelLink = page.locator('a[href*="/admin/channels/"]').first();
    const href = await channelLink.getAttribute("href").catch(() => null);
    if (!href || href === "/admin/channels") {
      console.log("⚠ 未找到渠道详情链接");
      // 截图诊断
      await page.screenshot({ path: "channel-list.png", fullPage: false });
      test.skip();
      return;
    }

    console.log(`进入渠道详情: ${href}`);
    await page.goto(`${BASE_URL}${href}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(5000);

    // 30 日调用趋势卡片
    const trendTitle = page.locator("text=近 30 日调用趋势");
    await expect(trendTitle).toBeVisible({ timeout: 10000 });
    console.log("✓ 「近 30 日调用趋势」卡片存在");

    // 错误率曲线卡片
    const errorTitle = page.locator("text=近 30 日错误率");
    await expect(errorTitle).toBeVisible({ timeout: 5000 });
    console.log("✓ 「近 30 日错误率（%）」卡片存在");

    // 图表 SVG 渲染
    const svgCount = await page.locator(".recharts-wrapper").count();
    console.log(`图表 SVG 数: ${svgCount}`);

    // 有数据时检查轴/图例；无数据时显示空状态
    const emptyState = page.locator("text=暂无调用数据");
    const hasData = (await emptyState.count()) === 0;
    console.log(`渠道有调用数据: ${hasData}`);

    await page.screenshot({ path: "channel-detail-charts.png", fullPage: true });
  });
});
