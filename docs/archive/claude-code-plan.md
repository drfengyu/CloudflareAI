# 渠道管理功能实施计划

## 需求概述
用户希望增加渠道管理功能，使得不同渠道可以展示不同的模型列表。这实际上是指：
- 管理不同的API提供商渠道（Cloudflare Workers AI、OpenAI、Anthropic等）
- 每个渠道可以有独立的模型白名单/黑名单
- 根据渠道路由到相应的上游API实现

## 当前状态分析
从代码探索可以看到：
1. 已有 `channel` 字段在 `usage_log` 表中，但仅用于记录请求来源（web/openai/anthropic）
2. 已有 `source` 字段在模型目录中，表示模型的计费方式（hosted/proxied）
3. 目前仅支持 Cloudflare Workers AI 作为上游
4. 需要扩展为支持多个API提供商

## 实施方案

### 第一步：数据库 schema 扩展
1. 创建 `channels` 表来管理不同的API提供商
2. 扩现有表以支持渠道关联
3. 为 API Key 添加渠道关联

### 第二步：后端逻辑实现
1. 渠道管理API（CRUD操作）
2. 根据渠道路由到不同的上游适配器
3. 渠道特定的模型目录和定价
4. 渠道级别的计费和配额管理

### 第三步：前端界面
1. 渠道管理页面（类似 API Key 管理）
2. 渠道配置表单（名称、类型、密钥、状态等）
3. 渠道下的模型管理

### 第四步：网关适配
1. 为每种渠道类型创建适配器
2. 统一的请求/响应转换层
3. 错误处理和重试机制

## 详细实施步骤

### 阶段1：基础设施
#### 1.1 数据库迁移
- 创建 `channels` 表
- 为 `api_keys` 表添加 `channel_id` 外键
- 为 `model_pricing` 表添加 `channel_id` 支持

#### 1.2 核心类型定义
- 定义 Channel 类型和枚举
- 创建渠道适配器接口

### 阶段2：后端API
#### 2.1 渠道管理API
- POST /api/channels - 创建渠道
- GET /api/channels - 列出渠道
- GET /api/channels/[id] - 获取渠道详情
- PUT /api/channels/[id] - 更新渠道
- DELETE /api/channels/[id] - 删除渠道
- POST /api/channels/[id]/toggle - 启用/禁用渠道

#### 2.2 渠道路由网关
- 修改现有的 `/v1/*` 路由以支持渠道识别
- 基于 API Key 的 channel_id 路由到相应适配器
- 统一错误处理和响应格式

#### 2.3 渠道特定功能
- 渠道模型目录获取（不同渠道可能有不同模型）
- 渠道定价和计费适配
- 渠道特定的参数转换（如 Anthropic ↔ OpenAI 转换）

### 阶段3：前端界面
#### 3.1 渠道管理页面
- 新增 `/admin/channels` 页面
- 渠道列表展示（名称、类型、状态、创建时间）
- 渠道创建/编辑抽屉/模态框

#### 3.2 渠道详情页
- 渠道基本信息
- 关联的 API Keys 列表
- 渠道使用统计
- 渠道模型列表管理

### 阶段4：适配器实现
#### 4.1 Cloudflare Workers AI 适配器（现有）
- 保持现有实现作为默认渠道

#### 4.2 OpenAI 适配器
- 实现 OpenAI API 兼容层
- 参考 existing anthropic.ts 的转换逻辑

#### 4.3 Anthropic 适配器
- 实现 Anthropic API 兼容层
- 需要双向转换（因为我们主要面向 OpenAI 兼容接口）

## 关键文件修改预览

### 新增文件
- `lib/channels/` 目录 - 渠道管理核心逻辑
- `lib/channels/adapter.ts` - 渠道适配器抽象基类
- `lib/channels/cloudflare-adapter.ts` - Cloudflare 适配器
- `lib/channels/openai-adapter.ts` - OpenAI 适配器
- `lib/channels/anthropic-adapter.ts` - Anthropic 适配器
- `lib/db/schema.ts` - 渠道相关表结构
- `app/api/channels/route.ts` - 渠道管理API
- `app/admin/channels/page.tsx` - 渠道管理页面
- `app/admin/channels/[id]/page.tsx` - 渠道详情页

### 修改文件
- `lib/db/schema.ts` - 添加channels表和关联
- `lib/usage/meter.ts` - 支持按渠道计量
- `app/v1/*/route.ts` - 修改为支持渠道路由
- `lib/cloudflare/catalog.ts` - 支持按渠道过滤模型
- `app/api/ai/*/route.ts` - Playground路由支持渠道

## 风险与注意事项
1. 向后兼容性：现有API Key和用户数据需要迁移
2. 性能影响：渠道路由增加少量开销
3. 复杂性增加：需要维护多个适配器
4. 错误处理：不同渠道的错误格式需要统一
5. 安全性：渠道密钥需要妥善存储

## 验证计划
1. 单元测试：渠道适配器功能测试
2. 集成测试：端到端请求流程测试
3. 手动测试：多渠道切换和模型访问
4. 性能测试：确保渠道路由不显著影响延迟
5. 安全审查：密钥存储和访问控制

## 里程碑
- [ ] 阶段1：数据库和基础设施（2天）
- [ ] 阶段2：后端API和核心逻辑（3天）
- [ ] 阶段3：前端管理界面（2天）
- [ ] 阶段4：适配器实现和测试（3天）
- [ ] 测试和文档（1天）

总计约11天开发时间。