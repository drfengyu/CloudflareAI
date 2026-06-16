import { test, expect } from "@playwright/test";

test.describe("Authentication UI", () => {
  test("should display enhanced login layout on desktop", async ({ page }) => {
    await page.goto("/login");

    // 检查页面标题
    await expect(page).toHaveTitle(/Cloudflare AI Console/i);

    // 检查品牌展示区（桌面端才显示）
    const brandSection = page.locator("text=Cloudflare AI Console").first();
    await expect(brandSection).toBeVisible();

    // 检查功能亮点
    await expect(page.getByText("78+ AI 模型")).toBeVisible();
    await expect(page.getByText("精确计量与数据看板")).toBeVisible();
    await expect(page.getByText("OpenAI / Anthropic 兼容")).toBeVisible();

    // 检查登录表单
    await expect(page.getByLabel("邮箱")).toBeVisible();
    await expect(page.getByLabel("密码")).toBeVisible();
    await expect(page.getByRole("button", { name: "登录" })).toBeVisible();

    // 检查 OAuth 按钮
    await expect(
      page.getByRole("button", { name: "使用 GitHub 继续" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "使用 LinuxDO 继续" })
    ).toBeVisible();

    // 检查按钮间距（不应该重叠）
    const githubBtn = page.getByRole("button", { name: "使用 GitHub 继续" });
    const linuxdoBtn = page.getByRole("button", { name: "使用 LinuxDO 继续" });
    const githubBox = await githubBtn.boundingBox();
    const linuxdoBox = await linuxdoBtn.boundingBox();

    expect(githubBox).not.toBeNull();
    expect(linuxdoBox).not.toBeNull();
    // LinuxDO 按钮应该在 GitHub 按钮下方至少 8px
    expect(linuxdoBox!.y).toBeGreaterThan(githubBox!.y + githubBox!.height);
  });

  test("should show register link", async ({ page }) => {
    await page.goto("/login");
    const registerLink = page.getByRole("link", { name: "注册" });
    await expect(registerLink).toBeVisible();
    await expect(registerLink).toHaveAttribute("href", "/register");
  });
});

test.describe("Temp Email Blocking", () => {
  test("should block temporary email registration", async ({ page }) => {
    await page.goto("/register");

    // 填写临时邮箱
    await page.getByLabel("邮箱").fill("test@10minutemail.com");
    await page.getByLabel("密码").fill("testpassword123");
    await page.getByRole("button", { name: "注册" }).click();

    // 等待错误提示
    await expect(page.getByText(/不支持使用临时邮箱注册/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test("should allow normal email registration attempt", async ({ page }) => {
    await page.goto("/register");

    // 填写正常邮箱（可能会因为已注册而失败，但不应该是临时邮箱错误）
    await page.getByLabel("邮箱").fill("test@gmail.com");
    await page.getByLabel("密码").fill("testpassword123");
    await page.getByRole("button", { name: "注册" }).click();

    // 等待响应
    await page.waitForTimeout(2000);

    // 不应该显示临时邮箱错误
    await expect(page.getByText(/不支持使用临时邮箱/i)).not.toBeVisible();
  });
});

test.describe("IP Rate Limiting", () => {
  test("should allow first registration", async ({ page }) => {
    await page.goto("/register");

    // 使用随机邮箱
    const randomEmail = `test${Date.now()}@example.com`;
    await page.getByLabel("邮箱").fill(randomEmail);
    await page.getByLabel("密码").fill("testpassword123");
    await page.getByRole("button", { name: "注册" }).click();

    // 等待响应
    await page.waitForTimeout(2000);

    // 不应该显示 IP 限制错误
    await expect(
      page.getByText(/该 IP 地址今日注册次数已达上限/i)
    ).not.toBeVisible();
  });
});

test.describe("LinuxDO OAuth", () => {
  test("should have LinuxDO login button", async ({ page }) => {
    await page.goto("/login");

    const linuxdoBtn = page.getByRole("button", {
      name: "使用 LinuxDO 继续",
    });
    await expect(linuxdoBtn).toBeVisible();
    await expect(linuxdoBtn).toBeEnabled();
  });

  test("should redirect to LinuxDO auth page when clicked", async ({
    page,
  }) => {
    await page.goto("/login");

    // 点击 LinuxDO 登录按钮
    const linuxdoBtn = page.getByRole("button", {
      name: "使用 LinuxDO 继续",
    });

    // 监听导航事件
    const [newPage] = await Promise.all([
      page.context().waitForEvent("page"),
      linuxdoBtn.click(),
    ]);

    // 等待新页面加载
    await newPage.waitForLoadState();

    // 检查是否跳转到 LinuxDO 授权页面
    const url = newPage.url();
    expect(url).toContain("connect.linux.do");
    expect(url).toContain("oauth2/authorize");
  });
});
