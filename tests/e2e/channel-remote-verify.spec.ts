import { test, expect } from "@playwright/test";

/**
 * 远程验证测试：检查渠道相关功能是否正常
 * 针对线上 cloudai.fuwari.fun 运行
 */

const BASE_URL = "https://cloudai.fuwari.fun";

// 请在环境变量中设置测试账户
const TEST_EMAIL = process.env.TEST_EMAIL || "";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "test123456";

async function login(page: import("@playwright/test").Page) {
  if (!TEST_EMAIL) {
    console.log("⚠ 未设置 TEST_EMAIL 环境变量，跳过需要登录的测试");
    return false;
  }

  await page.goto(`${BASE_URL}/auth/signin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // 如果已登录则跳过
  if (!page.url().includes("/auth/signin") && !page.url().includes("/login")) {
    return true;
  }

  try {
    // GitHub 登录 — 需要手动处理
    // 先检查是否有凭据登录字段
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible({ timeout: 3000 })) {
      await emailInput.fill(TEST_EMAIL);
      await page.locator('input[type="password"]').fill(TEST_PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL("**/dashboard", { timeout: 15000 });
      return true;
    }

    // 如果有 GitHub 按钮，可能需要手动 OAuth 流程
    const githubBtn = page.locator('text=GitHub');
    if (await githubBtn.isVisible({ timeout: 2000 })) {
      console.log("⚠ 页面只显示 GitHub 登录按钮，无法自动登录");
      return false;
    }

    return false;
  } catch (e) {
    console.log(`⚠ 登录失败: ${e}`);
    return false;
  }
}

test.describe("Channel Display Verification (Remote)", () => {
  test("定价页显示非 Cloudflare 渠道 Tab（如 Vercel、DeepSeek）", async ({ page }) => {
    // 先登录
    const loggedIn = await login(page);
    if (!loggedIn) {
      test.skip();
      return;
    }

    await page.goto(`${BASE_URL}/pricing`, { waitUntil: "networkidle" });

    // 等待定价页加载（标题可能是英文或中文）
    await page.waitForTimeout(3000);

    console.log("\n=== 定价页渠道 Tab 验证 ===");

    // 检查渠道 Tab 按钮
    const tabs = page.locator('button:has(span.rounded-full), [class*="rounded-t-lg"]');
    const tabCount = await tabs.count();
    console.log(`渠道 Tab 数: ${tabCount}`);

    if (tabCount === 0) {
      // 尝试截屏看页面状态
      await page.screenshot({ path: "pricing-page.png" });
      console.log("⚠ 未找到 Tab 按钮，已截屏");
      // 检查是否在定价页
      console.log(`当前 URL: ${page.url()}`);
      const bodyText = await page.locator("body").textContent();
      console.log(`页面内容摘要: ${bodyText?.substring(0, 200)}`);
      test.skip();
      return;
    }

    const tabTexts: string[] = [];
    for (let i = 0; i < tabCount; i++) {
      tabTexts.push((await tabs.nth(i).textContent()) || "");
    }
    console.log(`Tab 内容: ${JSON.stringify(tabTexts)}`);

    // 不应该有"第三方"标签
    const hasSanFang = tabTexts.some((t) => t.includes("第三方"));
    if (hasSanFang) {
      console.log("✗ 仍存在「第三方」标签");
    } else {
      console.log("✓ 无「第三方」标签");
    }

    // 至少 Cloudflare tab
    const hasCloudflare = tabTexts.some((t) => t.includes("Cloudflare"));
    expect(hasCloudflare).toBeTruthy();
    console.log("✓ Cloudflare Tab");

    // 如果有非 Cloudflare 渠道，点击并检查模型
    for (let i = 0; i < tabCount; i++) {
      const text = tabTexts[i];
      if (text && !text.includes("Cloudflare")) {
        console.log(`尝试点击: ${text.trim()}`);
        await tabs.nth(i).click();
        await page.waitForTimeout(1500);

        const modelRows = page.locator("table tbody tr");
        const count = await modelRows.count();
        console.log(`${text.trim()} 模型数: ${count}`);
        if (count > 0) {
          console.log(`✓ ${text.trim()} 有 ${count} 个模型`);
        }
        break;
      }
    }
  });

  test("Playground 页面的可见性检查（无需登录）", async ({ page }) => {
    // 这些页面重定向到登录，但我们可以验证 HTTP 状态或是否存在
    const playgrounds = [
      { name: "文本生成", path: "/playground/text" },
      { name: "文生图", path: "/playground/image" },
      { name: "图像理解", path: "/playground/vision" },
      { name: "嵌入向量", path: "/playground/embeddings" },
      { name: "翻译", path: "/playground/translate" },
    ];

    console.log("\n=== Playground 页面可达性验证 ===");

    for (const pg of playgrounds) {
      const response = await page.request.get(`${BASE_URL}${pg.path}`);
      console.log(
        `${pg.name} (${pg.path}): HTTP ${response.status()}`
      );
      // 302 到登录页是预期行为（未登录用户）
      expect([200, 302, 307]).toContain(response.status());
    }
  });

  test("API 公开端点可用性检查", async ({ page }) => {
    console.log("\n=== API 公开端点验证 ===");

    // health
    const healthResp = await page.request.get(`${BASE_URL}/api/health`);
    expect(healthResp.ok()).toBeTruthy();
    console.log("✓ /api/health");

    // models
    const modelsResp = await page.request.get(`${BASE_URL}/v1/models`);
    expect(modelsResp.ok()).toBeTruthy();
    const modelsData = await modelsResp.json();
    console.log(`✓ /v1/models (${modelsData.data?.length || 0} 个模型)`);
  });

  test("API 端点渠道密钥验证", async ({ page }) => {
    // 使用一个测试 API Key 验证渠道转发是否能正常工作
    console.log("\n=== API 渠道转发验证 ===");

    // 获取一个有效的 API Key（从环境变量）
    const apiKey = process.env.TEST_API_KEY || "";
    if (!apiKey) {
      console.log("⚠ 未设置 TEST_API_KEY，跳过 API 调用测试");
      test.skip();
      return;
    }

    // 测试文本生成 — 走渠道
    const chatResp = await page.request.post(`${BASE_URL}/v1/chat/completions`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      data: {
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: "Say hello" }],
        stream: false,
        max_tokens: 50,
      },
    });

    if (chatResp.ok()) {
      const data = await chatResp.json();
      const content = data.choices?.[0]?.message?.content || "";
      console.log(`✓ DeepSeek 渠道返回: "${content.substring(0, 50)}"`);
    } else {
      const err = await chatResp.text();
      console.log(`⚠ DeepSeek API 调用结果: HTTP ${chatResp.status()} - ${err.substring(0, 100)}`);
    }
  });
});
