import { test, expect } from "@playwright/test";
import * as path from "path";

/**
 * 图像理解 vision API 修复后的端到端测试。
 *
 * 流程：
 * 1. 打开生产环境登录页，等待用户手动完成 LinuxDO 登录
 * 2. 跳转到 /playground/vision
 * 3. 自动上传 tests/e2e/fixtures/red-square.png
 * 4. 输入 prompt
 * 5. 点击"分析"按钮
 * 6. 验证返回的是文本结果而非错误信息
 *
 * 运行：
 *   npx playwright test tests/e2e/vision-fix.spec.ts --headed --project=chromium
 */

const PROD_URL = "https://cloudai.fuwari.fun";
const IMAGE_PATH = path.resolve(__dirname, "fixtures/test.jpg");

test.describe("图像理解 API 修复验证", () => {
  test.use({ baseURL: PROD_URL });
  test.setTimeout(5 * 60 * 1000); // 5 分钟给 OAuth 留时间

  test("登录 → 上传图片 → 验证 vision API 返回成功", async ({ page }) => {
    // ===== 步骤 1: 打开登录页 =====
    await page.goto("/login");
    console.log("\n👉 请用任意方式登录（GitHub / LinuxDO / 邮箱）...\n");

    // 等待跳转回受保护页面
    await page.waitForURL(/\/dashboard|\/$|\/playground/, { timeout: 4 * 60 * 1000 });
    console.log("✅ 登录成功\n");

    // ===== 步骤 2: 跳转到图像理解 =====
    await page.goto("/playground/vision");
    await page.waitForLoadState("networkidle");
    console.log("📍 已打开图像理解页面");

    // 截图：初始页面
    await page.screenshot({
      path: "tests/e2e/screenshots/vision-01-initial.png",
      fullPage: true,
    });

    // ===== 步骤 3: 上传图片 =====
    // 找到 <input type="file">
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached({ timeout: 10000 });
    await fileInput.setInputFiles(IMAGE_PATH);
    console.log(`📸 已上传图片: ${IMAGE_PATH}`);

    // 等待预览出现
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "tests/e2e/screenshots/vision-02-uploaded.png",
      fullPage: true,
    });

    // ===== 步骤 4: 输入 prompt =====
    const promptInput = page.locator('textarea, input[type="text"]').first();
    await promptInput.fill("Describe this image in one sentence.");
    console.log("✍️  已输入 prompt");

    // ===== 步骤 5: 抓取 API 响应 =====
    // 监听 /api/ai/vision 的响应
    const visionResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/ai/vision"),
      { timeout: 60000 },
    );

    // 点击"分析"按钮
    const analyzeBtn = page
      .getByRole("button", { name: /分析|提交|发送|Analyze/i })
      .first();
    await analyzeBtn.click();
    console.log("🚀 已点击分析按钮，等待 API 响应...");

    const visionResp = await visionResponsePromise;
    const status = visionResp.status();
    const respBody = await visionResp.json().catch(() => ({}));

    console.log(`\n=== /api/ai/vision 响应 ===`);
    console.log(`Status: ${status}`);
    console.log(`Body: ${JSON.stringify(respBody, null, 2)}\n`);

    // ===== 步骤 6: 等待 UI 更新 + 截图 =====
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: "tests/e2e/screenshots/vision-03-result.png",
      fullPage: true,
    });

    // ===== 验证 =====
    expect(status).toBe(200);
    expect(respBody).toHaveProperty("text");
    expect(typeof respBody.text).toBe("string");
    expect(respBody.text.length).toBeGreaterThan(0);

    // 不应该包含错误关键字
    if (respBody.error) {
      throw new Error(`Vision API still returns error: ${respBody.error}`);
    }
    if (respBody.text?.toLowerCase().includes("aierror")) {
      throw new Error(`Response text contains AiError: ${respBody.text}`);
    }

    console.log(`\n✅ Vision API 返回正常文本（长度: ${respBody.text.length}）`);
    console.log(`📝 模型回答: ${respBody.text.substring(0, 200)}...\n`);

    // ===== 同步验证数据库（确认 logUsage 写入 status='ok'） =====
    console.log("👉 等待 1.5s 后请手动 / 让我从 D1 查询验证 usage_log");
    await page.waitForTimeout(1500);
  });
});
