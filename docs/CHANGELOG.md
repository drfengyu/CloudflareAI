# 变更记录

遵循约定：每次提交在此追加一条记录（日期 + 阶段 + 摘要）。

## 2026-06-12 — P4 用量监控

- 用量查询函数（`lib/usage/queries.ts`）：今日/本月统计、配额查询、分页历史记录。
- **Dashboard**（`/dashboard`）：展示今日/本月调用次数、Neuron 消耗、费用估算、配额进度条、最近 10 次调用。
- **使用历史**（`/history`）：分页查询所有调用记录（20 条/页），支持按模型/任务筛选，显示 tokens/neurons/延迟/时间。
- **设置**（`/settings`）：展示用户每日/每月 Neuron 配额、计费说明（hosted vs proxied 模型）、用户 ID。
- 配额预警：当今日 Neuron 用量超过 90% 时显示警告提示。

## 2026-06-12 — P3 Playground 在线生成

- 用量计量中间件 `lib/usage/meter.ts`：每次 AI 调用写入 `usage_log`，记录模型/任务/tokens/神经元/延迟/状态。
- **文本生成**（`/playground/text`）：对话式流式生成，支持温度/max_tokens 控制，SSE 透传。
- **文生图**（`/playground/image`）：提示词 → PNG（base64），支持 num_steps/guidance 调节，可下载。
- **图像理解**（`/playground/vision`）：上传图片 + 提问 → 文本回答（vision 模型）。
- **嵌入**（`/playground/embeddings`）：文本 → 向量数组，展示前 10 维预览。
- **翻译**（`/playground/translate`）：源文本 + 目标语言 → 译文（7 种常用语言）。
- **语音/视频**（占位页）：提示 Cloudflare 原生支持有限，链接第三方 API（fal.ai / Replicate / Luma）。
- API routes：`/api/ai/{text,image,vision,embeddings,translate}`，统一错误处理与用量记录。

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
