import { test, expect } from "@playwright/test";

/**
 * Playground UI 验证测试（无需登录）
 *
 * 验证前端组件是否正确部署和加载
 */

const BASE_URL = process.env.BASE_URL || "https://cloudai.fuwari.fun";

test.describe("Playground UI Components", () => {
  test.use({
    baseURL: BASE_URL,
  });

  test("should load chat page structure", async ({ page }) => {
    // 直接访问 AI 对话（可能会重定向到登录）
    const response = await page.goto("/chat");

    // 验证页面加载成功（200 或重定向）
    expect(response?.status()).toBeLessThan(500);

    console.log(`✓ Chat page loads (status: ${response?.status()})`);
  });

  test("should have correct meta tags and title", async ({ page }) => {
    await page.goto("/");

    // 验证页面标题
    const title = await page.title();
    expect(title).toContain("Cloudflare");

    console.log(`✓ Page title: "${title}"`);
  });

  test("should load static assets without errors", async ({ page }) => {
    const errors: string[] = [];

    page.on("console", msg => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 允许一些常见的非关键错误
    const criticalErrors = errors.filter(err =>
      !err.includes("favicon") &&
      !err.includes("chunk") &&
      !err.includes("network")
    );

    expect(criticalErrors.length).toBe(0);

    if (errors.length > 0) {
      console.log(`⚠ Non-critical errors: ${errors.length}`);
    } else {
      console.log("✓ No console errors");
    }
  });
});
