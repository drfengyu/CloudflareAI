import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    // 3000 被别的项目占用时，用 PLAYWRIGHT_BASE_URL 指向本项目实际端口
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // 换端口跑时要同时覆盖 NEXTAUTH_URL / NEXT_PUBLIC_APP_URL，
    // 否则未登录请求会被重定向到 .env.local 里写死的 3000，探活打到别的应用上。
    timeout: 240_000,
  },
});
