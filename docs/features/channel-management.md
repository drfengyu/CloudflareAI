# AI 供应商渠道管理

> 本文档描述 CloudflareAI 的多渠道管理系统设计和使用方式。
> 最后更新：2026-06-18

## 概述

渠道管理系统允许管理员连接多个 AI 模型供应商（如 OpenAI、Anthropic、Azure 等），
通过统一的 API 网关进行路由转发。用户可以通过 API Key 关联到特定渠道，实现多供应商支持。

## 架构

```
┌─────────────────────────────────────────────────────┐
│                    Admin UI                          │
│  /admin/channels (列表/CRUD)                        │
│  /admin/channels/[id] (详情/模型/统计)               │
└──────────────┬──────────────────────────────────────┘
               │ REST API
┌──────────────▼──────────────────────────────────────┐
│              Channel API Routes                      │
│  /api/channels (CRUD)                               │
│  /api/channels/[id]/health                          │
│  /api/channels/[id]/stats                           │
│  /api/channels/[id]/models (sync/CRUD)              │
└──────────────┬──────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────┐
│              Adapter Registry                        │
│  getAdapter(type) → ChannelAdapter                   │
│  CHANNEL_CONFIG_FIELDS[type] → ConfigField[]         │
└──────┬──────────────┬──────────────────┬────────────┘
       │              │                  │
┌──────▼──────┐ ┌────▼──────┐  ┌───────▼───────┐
│ OpenAI      │ │ Anthropic │  │ Cloudflare    │
│ Adapter     │ │ Adapter   │  │ Adapter       │
│ (直通)      │ │ (直通)    │  │ (内置逻辑)    │
└─────────────┘ └───────────┘  └───────────────┘
```

## 核心组件

### 1. 适配器接口（`lib/channels/adapter.ts`）

```typescript
interface ChannelAdapter {
  id: string;
  name: string;
  type: string;
  route(path: string, request: Request, context): Promise<Response>;
  healthCheck?(context): Promise<{ ok: boolean; message: string }>;
  listModels?(context): Promise<{ id: string; object: string }[]>;
}
```

### 2. 适配器注册表（`lib/channels/registry.ts`）

注册表管理所有适配器实例，并提供：
- `getAdapter(type)` — 根据类型获取适配器
- `getAllAdapters()` — 获取所有适配器
- `CHANNEL_TYPES` — 渠道类型常量列表
- `CHANNEL_CONFIG_FIELDS` — 各渠道类型的配置字段定义（用于 UI 动态表单）

### 3. 渠道路由网关（`lib/channels/router.ts`）

根据 API Key 关联的 `channelId`，自动将请求路由到对应上游：
- **cloudflare**：保持内置 Workers AI 逻辑不变
- **openai**：直通 OpenAI API（支持自定义 Base URL、Organization ID）
- **anthropic**：直通 Anthropic API（支持自定义 API 版本）
- **azure**：直通 Azure OpenAI 服务

## 渠道类型及配置字段

| 类型 | 必需字段 | 可选字段 | 说明 |
|------|---------|---------|------|
| `cloudflare` | — | accountId, apiToken | 使用内置 Workers AI |
| `openai` | apiKey | baseUrl, organizationId | 直通 OpenAI API |
| `anthropic` | apiKey | baseUrl, apiVersion | 直通 Anthropic API |
| `azure` | apiKey, endpoint, deploymentName | apiVersion | Azure OpenAI 服务 |

## API 端点

所有渠道管理 API 需要管理员权限（role ≥ 10）。

### 渠道 CRUD

```
GET    /api/channels                    # 列出所有渠道
POST   /api/channels                    # 创建渠道
GET    /api/channels/[id]               # 获取渠道详情
PUT    /api/channels/[id]               # 更新渠道
DELETE /api/channels/[id]               # 软删除（status=3）
```

### 渠道操作

```
GET    /api/channels/[id]/health        # 健康检查
GET    /api/channels/[id]/stats         # 使用统计
```

**健康检查响应**：
```json
{
  "ok": true,
  "message": "连接正常"
}
```

### 模型管理

```
GET    /api/channels/[id]/models             # 列出关联模型
POST   /api/channels/[id]/models/sync        # 从上游同步模型列表
PUT    /api/channels/[id]/models/[modelId]   # 更新模型倍率
DELETE /api/channels/[id]/models/[modelId]   # 移除模型关联
```

## 管理界面

### 渠道列表页（`/admin/channels`）

- 搜索过滤（名称/类型）
- 创建/编辑渠道对话框（动态配置表单）
- 健康检查按钮
- 启用/禁用状态切换
- 详情查看链接
- 删除操作

### 渠道详情页（`/admin/channels/[id]`）

- 基本信息卡片（类型/状态/关联密钥数/调用统计）
- 渠道配置信息展示
- 关联模型列表（含倍率）
- 关联 API Key 列表（含状态/额度）
- 热门模型 Top 10 排行
- 健康检查 + 模型同步操作按钮

## 使用示例

### 创建 OpenAI 渠道

```bash
curl -X POST /api/channels \
  -H "Content-Type: application/json" \
  -d '{
    "name": "OpenAI 主账号",
    "type": "openai",
    "config": {
      "apiKey": "sk-xxxxxxxx",
      "baseUrl": "https://api.openai.com/v1"
    }
  }'
```

### 创建 API Key 并关联到渠道

在 `/keys` 页面创建 API Key 时，从「渠道」下拉选择已创建的渠道。
关联后，使用该 Key 的请求会自动转发到对应供应商。

### 同步远程模型列表

```bash
curl -X POST /api/channels/[id]/models/sync
# 响应: {"message": "同步完成：新增 156 个模型，共 156 个", "total": 156, "inserted": 156}
```

## 设计要点

1. **渠道状态**：1=启用 / 2=禁用 / 3=已删除（软删除）
2. **API Key 关联**：`apiKey.channelId` 外键，允许 API Key 选择路由渠道
3. **模型管理**：同步远程模型到 `model_pricing` 表，支持按渠道独立定价
4. **健康检查**：验证上游 API Key 有效性，失败不影响服务运行
5. **安全**：所有渠道 API 端点需要管理员权限（role ≥ 10）
6. **Next.js 16 兼容**：所有路由处理器使用 `Promise<{ channelId: string }>` 接收 params
