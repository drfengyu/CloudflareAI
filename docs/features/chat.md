# 站内聊天（/chat）设计文档

> v0.9.0 新增。迁移：`migrations/016_chat_tables.sql`（已在线上 D1 执行）。

## 功能概述

把原来只有「一次一问」的 Playground 做成可日常使用的对话产品：会话持久化、多轮上下文、
markdown 渲染、停止生成、重新生成、编辑重发。扣费与用量口径完全复用现有 `/api/ai/text`，
不另起一套计费。

## 数据库

### chat_session

| 列 | 说明 |
|----|------|
| `id` / `userId` | userId 为级联外键 |
| `title` | 默认「新对话」；首条用户消息自动换成内容摘要（前 24 字），手动改名后不再覆盖 |
| `model` | 会话默认模型 |
| `systemPrompt` | 每次请求都会带上 |
| `pinned` | 1=置顶，列表排前 |
| `shareToken` | 预留列，公开分享页使用；null=未分享 |
| `createdAt` / `lastMessageAt` | 列表按 `pinned desc, lastMessageAt desc` |

索引：`idx_chat_session_user_list (userId, pinned, lastMessageAt)`。

### chat_message

| 列 | 说明 |
|----|------|
| `sessionId` | 级联外键，删会话即带走消息 |
| `seq` | 会话内递增，`uq_chat_message_seq (sessionId, seq)` 唯一 |
| `role` | `system` / `user` / `assistant` |
| `content` / `reasoning` | 正文与思考链分开存，渲染时可折叠 |
| `creditsUsed` | **real**（`conversation_history.creditsUsed` 是 integer 却写小数，新表不再重犯） |

`seq` 先 `MAX(seq)+1` 读、再写；D1 没有事务，并发撞车由唯一索引拒绝后重算重试（最多 3 次）。

## 链路

```
/chat 客户端
  ├─ POST /api/ai/text（stream:true）        ← 扣费/预检/渠道路由/限流都在这里
  │    └─ SSE 由 lib/chat/stream-accumulator.ts 累积成 { content, reasoning }
  ├─ 流完（或用户点停止）→ persistTurnAction 落库一问一答
  └─ router.refresh() 同步左侧会话列表
```

三种动作共用一条 `runTurn`：

| 动作 | `userContent` | `truncateFromSeq` | 效果 |
|------|---------------|-------------------|------|
| 发送 | 新问题 | — | 追加一问一答 |
| 重新生成 | null | 旧回答的 seq | 删旧回答及之后，重写回答，不重复问题 |
| 编辑重发 | 改后的问题 | 该问题 seq | 从这条起重建 |

点「停止」时 `reader.read()` 抛 `AbortError`，已生成的半截内容同样落库并标记 `partial`，
服务端按实际收到的 token 结算（`stream-intercept` 的截断判定负责）。
服务端动作落库失败时给显式 toast（`saveTurn` 返回 `undefined`），不能只留一个未捕获 rejection——
那样用户以为存好了，刷新才发现没了。

## 计费与防刷（本版顺带补的缺口）

- `app/api/ai/text/route.ts`：余额预检从「渠道分支之后」上移到「渠道路由之前」。
  第三方渠道分支是直接 `return` 的，旧顺序让它完全绕过 402 闸门——0 额度的 key 照样能从站内打外部渠道。
  实测：额度 0 的 key 请求挂在启用 deepseek 渠道上的模型，返回
  `402 API key quota exhausted：本次预检需要 153.65 cr，当前可用 0.00 cr`，且 `usage_log` 没有 `status=ok` 行（没打到上游）。
- `/api/ai/*` 五个端点补 `playgroundRateLimitResponse`（`lib/rate-limit.ts`）：每用户每类任务 30 次/分，
  进程内计数（与 `/v1` 同一套理由——不值得为限流多打一次 D1 写），超限 429。实测第 31 次起全部 429。

## 会话与状态

- 会话切换走 `/chat?s=<id>`，服务端读库渲染；`ChatShell` 用 `key={active?.id ?? "new"}` 在切换时重挂载，
  避免「props 同步进 state」的级联渲染。
- 新会话在首次发送时才创建（`createSessionAction`），URL 仍是 `/chat`，等落库后由列表高亮本地 state。
- 流式期间 `MessageItem` 隐藏「重新生成 / 编辑重发」（`busy`）：`runTurn` 开头就 `if (streaming) return`，
  留着按钮只会给一个点了没反应的假象。

## 已知限制

- 上下文长度靠前端把全部历史重发给模型，没有做摘要/截断策略；超出模型窗口由上游报错兜住。
- 无附件：图片仍在 `/playground/vision`。
- token 估算用于「上下文占用」提示，与真实 usage 有偏差；真实计费一律以上游 usage 为准。
- `chat_message.creditsUsed` 目前恒为 0：扣费在 `usage_log`，站内没有逐条消息的额度展示，导出前需要补。
- 端到端见 `tests/e2e/v090-chat.spec.ts`（发送 / 落库 / 刷新回看 / 重新生成 / 编辑重发 / 停止 / markdown 渲染，
  跑完自清理并核对残留为 0）。
