# 变更记录

遵循约定：每次提交在此追加一条记录（日期 + 阶段 + 摘要）。

## 2026-06-12 — P2 鉴权 + D1/KV

- D1 schema（Auth.js 标准表 + 业务表：`api_key` / `usage_log` / `quota`），Drizzle 迁移已应用。
- D1/KV HTTP 客户端（`d1-http.ts` / `kv-http.ts`），sqlite-proxy 驱动适配 D1 REST API。
- Auth.js v5 双登录方式：
  - **邮箱密码**（Credentials provider）：注册/登录 server action，bcrypt 哈希。
  - **GitHub OAuth**：DrizzleAdapter 自动建账户关联。
- Middleware（Next 16 `proxy` 约定）：未登录重定向到 `/login`，已登录访问 `/login|/register` 重定向到 `/dashboard`。
- `/login` + `/register` 页面与统一表单组件，session 显示在侧边栏（用户名 + 退出按钮）。
- 端到端验证（浏览器）：注册 → 登录 → dashboard → GitHub OAuth → 模型库（250 个模型）。
- D1 数据验证：1 用户 + 1 配额行已创建，KV 读写通过。

## 2026-06-12 — P1 模型库

- Cloudflare REST 客户端 `lib/cloudflare/client.ts`（账户作用域、信封解包、错误类型、可选数据缓存）。
- 模型目录 `lib/cloudflare/catalog.ts`：分页拉取 `/ai/models/search`，归一化（id/名称/任务/来源/能力/定价）并按 `lib/categories.ts` 分类。
- 推理原语 `lib/cloudflare/ai.ts`：`runModelJSON`（文本）、`runModelBinary`（图像/语音）、`openaiCompatible`（`/ai/v1/*` 透传，支持流式）。
- 模型浏览器 UI：分类标签 + 搜索 + 卡片（来源标注 hosted/proxied、函数调用、上下文、定价）。
- `/models` 页服务端拉取并优雅降级（未配置凭证时展示引导）。
- 注：模型目录的线上验证需用户提供 Cloudflare 凭证。

## 2026-06-12 — P0 脚手架

- 初始化 Next.js 16（App Router, TS）+ Tailwind v4 项目。
- 控制台基础：`(dashboard)` 布局、侧边栏导航、用量总览页与各功能占位页
  （文本/文生图/图像理解/语音/嵌入/翻译/视频/模型库/历史/密钥/设置）。
- 轻量 UI 原语：`Button` / `Card` / `Badge` / `PageHeader`。
- 共享模型分类 `lib/categories.ts`（task → category），含视频「即将支持」占位。
- 环境配置 `lib/env.ts`（Cloudflare/Auth 变量 + Neuron 计费常量）、`.env.example`。
- 文档骨架：`README` + `docs/{ARCHITECTURE,MODELS,API,DEPLOYMENT,CHANGELOG}.md`。
- 安装核心依赖：zod、drizzle-orm、drizzle-kit、next-auth、clsx、tailwind-merge、lucide-react。
