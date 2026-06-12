# 变更记录

遵循约定：每次提交在此追加一条记录（日期 + 阶段 + 摘要）。

## 2026-06-12 — P0 脚手架

- 初始化 Next.js 16（App Router, TS）+ Tailwind v4 项目。
- 控制台基础：`(dashboard)` 布局、侧边栏导航、用量总览页与各功能占位页
  （文本/文生图/图像理解/语音/嵌入/翻译/视频/模型库/历史/密钥/设置）。
- 轻量 UI 原语：`Button` / `Card` / `Badge` / `PageHeader`。
- 共享模型分类 `lib/categories.ts`（task → category），含视频「即将支持」占位。
- 环境配置 `lib/env.ts`（Cloudflare/Auth 变量 + Neuron 计费常量）、`.env.example`。
- 文档骨架：`README` + `docs/{ARCHITECTURE,MODELS,API,DEPLOYMENT,CHANGELOG}.md`。
- 安装核心依赖：zod、drizzle-orm、drizzle-kit、next-auth、clsx、tailwind-merge、lucide-react。
