# 更新日志

本项目的所有重要变更都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

## [0.2.0] - 2026-06-15

### 新增

- **API Key 管理增强**
  - 新增每个 key 的使用统计（调用次数 + 消耗 credits）
  - 新增"调用"列，显示每个 key 的调用次数和消耗
  - 新增额度进度条可视化（无限额度和有限额度 key）
  - 通过 `usage_log` 聚合实现实时用量追踪
- **Error 追踪系统**
  - `usage_log` 表新增 `errorReason` 字段
  - Error 记录现在显示错误信息（带 tooltip）
  - 所有 API 错误处理器现在捕获并存储错误原因
- **渠道标识**
  - 明确的渠道标签：站内（web）、OpenAI、Anthropic
  - 清晰区分 playground 和 API 客户端调用
- **UI 改进**
  - 历史记录和数据看板采用 Grid 对齐布局
  - 固定宽度列实现完美垂直对齐
  - 数值指标（credits、延迟、时间）右对齐

### 变更

- **API Key 要求**
  - 所有 Playground API 现在需要有效的 API key（文本、图像、嵌入、翻译、视觉）
  - 如果用户未创建 API key，返回 403
  - 所有记录必须关联到 apiKeyId
- **额度显示逻辑**
  - 无限额度 key：显示 `已用 / 账户余额` + 百分比
  - 有限额度 key：显示 `剩余 / 总额度` + 进度条
  - 移除了没有数据支撑的误导性进度条
- **计费系统**
  - 修复 error 调用计费为 0 credits（之前按估算计费）
  - Error 记录现在正确显示"—"（0 cr）
  - 改进 FLUX-2 multipart 响应解析

### 修复

- **API Key 编辑**
  - 修复 KeySheet 在切换 key 时不重新挂载（添加 `key` prop）
  - 修复空字符串导致数据库 NaN（添加 trim + 条件 parseInt）
  - 添加余额验证：API key 额度不能超过账户余额
- **数据准确性**
  - 返还 4 条 error 记录错误扣除的 15,500 cr
  - 修正总用量从 43,982 cr 到 28,482 cr
  - 余额从 6,018 cr 恢复到 21,518 cr
- **列表对齐**
  - 修复因内容长短不一导致的列表项错位
  - 实现 CSS Grid 固定列宽
  - 所有数值指标现在正确右对齐

### 安全

- 添加服务端验证，防止 API key 额度超过用户余额
- 所有 Playground 端点现在需要认证和有效的 API key

## [0.1.0] - 2026-06-14

### 新增

- **核心功能**
  - Auth.js v5 用户认证
  - API key 生成和管理
  - 多模型支持（文本、图像、嵌入、视觉、翻译）
  - 用量追踪和日志记录
  - 基于 credits 的计费系统
- **数据看板**
  - 实时余额显示
  - 每小时和每日用量图表（recharts）
  - 模型使用分布图
  - 最近 10 次调用列表
- **Playground**
  - 文本生成（LLaMA、Qwen、DeepSeek）
  - 图像生成（FLUX、Stable Diffusion）
  - 视觉理解（图像理解）
  - 嵌入向量
  - 翻译
- **API 兼容性**
  - OpenAI 兼容端点（`/api/openai/v1/*`）
  - Anthropic 兼容端点（`/api/anthropic/v1/*`）
  - 模型列表和对话补全
- **数据库**
  - Cloudflare D1 + Drizzle ORM
  - Schema: users, api_keys, usage_log, conversations, topup, option
  - 迁移系统（通过 `/api/db-migrate`）

### 技术栈

- Next.js 16 (App Router)
- React 19
- Tailwind CSS v4
- TypeScript
- Cloudflare D1 + Drizzle ORM
- Auth.js v5
- Recharts 数据可视化

[未发布]: https://github.com/drfengyu/CloudflareAI/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/drfengyu/CloudflareAI/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/drfengyu/CloudflareAI/releases/tag/v0.1.0
