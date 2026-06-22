import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "https://cloudai.fuwari.fun";
const TEST_EMAIL = "drfengling@163.com";
const TEST_PASSWORD = "qq258654357";

test.describe("Debug API Key Edit", () => {
  test.use({ baseURL: BASE_URL });

  test("debug key edit flow", async ({ page }) => {
    // 登录
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await page.getByLabel(/邮箱|Email/i).fill(TEST_EMAIL);
    await page.getByLabel(/密码|Password/i).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /登录|Login|Sign in/i }).click();
    await page.waitForURL(/dashboard|keys|playground/, { timeout: 10000 });

    // 进入 keys 页面
    await page.goto("/keys");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    console.log("=== Step 1: Keys page loaded ===");
    await page.screenshot({ path: "tests/e2e/screenshots/keys-initial.png", fullPage: true });

    // 查找表格行
    const rows = await page.locator("table tbody tr").all();
    console.log(`Table rows: ${rows.length}`);

    if (rows.length === 0) {
      console.log("ERROR: No keys found");
      return;
    }

    const firstRow = rows[0];
    const rowText = await firstRow.textContent();
    console.log(`First row text: ${rowText?.slice(0, 150)}`);

    // 查找三个点按钮（MoreHorizontal 图标）
    const moreButton = firstRow.locator("button").first();
    console.log("=== Step 2: Clicking more button ===");
    await moreButton.click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: "tests/e2e/screenshots/keys-menu-open.png", fullPage: true });

    // 查找下拉菜单中的"编辑"按钮
    const editButton = page.locator('button:has-text("编辑")').or(
      page.locator('button').filter({ hasText: /编辑|Edit/i })
    );

    const editVisible = await editButton.isVisible().catch(() => false);
    console.log(`Edit button visible: ${editVisible}`);

    if (editVisible) {
      console.log("=== Step 3: Clicking edit button ===");
      await editButton.click();
      await page.waitForTimeout(1000);

      await page.screenshot({ path: "tests/e2e/screenshots/keys-edit-dialog.png", fullPage: true });

      // 检查编辑对话框
      const dialogTitle = await page.locator("h2, h3").filter({ hasText: /编辑/i }).textContent().catch(() => null);
      console.log(`Dialog title: ${dialogTitle}`);

      // 查找名称输入框
      const nameInput = page.locator('input[type="text"]').first();
      const nameVisible = await nameInput.isVisible().catch(() => false);
      console.log(`Name input visible: ${nameVisible}`);

      if (nameVisible) {
        const currentName = await nameInput.inputValue();
        console.log(`Current name: "${currentName}"`);

        // 修改名称
        const newName = `Test ${Date.now()}`;
        console.log(`=== Step 4: Changing name to "${newName}" ===`);
        await nameInput.fill(newName);

        // 保存
        const saveButton = page.locator('button').filter({ hasText: /保存|Save/i }).last();
        await saveButton.click();
        console.log("=== Step 5: Clicked save button ===");

        await page.waitForTimeout(2000);
        await page.screenshot({ path: "tests/e2e/screenshots/keys-after-save.png", fullPage: true });

        // 检查新名称是否出现
        const newNameVisible = await page.locator(`text="${newName}"`).isVisible({ timeout: 5000 }).catch(() => false);
        console.log(`New name visible: ${newNameVisible}`);

        if (newNameVisible) {
          console.log("✅ SUCCESS: Name updated successfully!");
        } else {
          console.log("❌ FAIL: Name not updated");
          const tableAfter = await page.locator("table").textContent();
          console.log(`Table after save: ${tableAfter?.slice(0, 200)}`);
        }
      }
    } else {
      console.log("❌ FAIL: Edit button not found in menu");

      // 检查页面上所有固定定位的元素
      const allButtons = await page.locator("button").allTextContents();
      console.log(`All buttons: ${JSON.stringify(allButtons)}`);
    }
  });
});
