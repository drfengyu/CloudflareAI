# Cloudflare AI Console

充分利用 **Cloudflare Workers AI**（约 78 个模型）的全功能控制台，部署在 **Vercel** 上：
按功能分类在线生成（文本 / 图像 / 图像理解 / 语音 / 嵌入 / 翻译），多用户使用记录与用量监控，
并对外提供 **OpenAI 兼容** 与 **Anthropic 兼容** 的 API 网关，供 Claude Code / Codex / Hermes 等编程工具直接调用。

## 功能进度

| 模块 | 说明 | 状态 |
| --- | --- | --- |
| P0 脚手架 | Next.js 16 + Tailwind v4 + 控制台布局 + 文档骨架 | ✅ |
| P1 模型库 | 同步 `/ai/models/search`，按分类展示 ~78 个模型 | ✅ |
| P2 鉴权 + D1/KV | Auth.js 多用户，D1/KV over REST，业务表 | ✅ |
| P3 在线生成 | 文本流式 / 文生图 / 视觉 / 语音 / 嵌入 / 翻译 | ✅ |
| P4 用量监控 | Neuron 记账、每日免费额度余量、费用估算、历史 | ✅ |
| P5 API 网关 | OpenAI（chat/embeddings/models）+ Anthropic（messages） | ⬜ |
| P6 收尾部署 | 限流、cron、Vercel 部署 | ⬜ |

## 技术栈

- **Next.js 16（App Router）+ TypeScript**，部署 Vercel
- **Tailwind CSS v4** + 自建轻量 UI 组件 + lucide 图标
- **Auth.js (NextAuth v5)** 多用户登录
- **Cloudflare D1 + KV**（通过 Cloudflare REST API 从 Vercel 访问），**Drizzle ORM** 管理 schema/迁移
- **Zod** 校验

## 快速开始

```bash
npm install
cp .env.example .env.local   # 填入 Cloudflare 凭证与 AUTH_SECRET
npm run dev                  # http://localhost:3000
```

## 文档

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 架构与目录结构
- [`docs/MODELS.md`](docs/MODELS.md) — 模型分类与 Workers AI 要点
- [`docs/API.md`](docs/API.md) — API 网关用法（OpenAI / Anthropic 兼容）
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Vercel + Cloudflare 部署
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — 变更记录

> 约定：**每次提交都同步更新相关 md 文档**，并在 `docs/CHANGELOG.md` 追加一条记录。
