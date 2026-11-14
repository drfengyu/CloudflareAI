# 加载慢 / 偶发加载不出来（2026-11-14）

## 现象

- 首屏有时停在骨架屏，偶尔直接落到错误页「这一页没能加载出来」。
- 登录页是静态缓存页，TTFB 仍有 1.0~1.2s；登录后的动态页更慢。

## 结构性问题

1. **链路**：`cloudai.fuwari.fun` 的 DNS 直接指向 Vercel，响应头 `X-Vercel-Id: sin1::…`，
   即新加坡节点且没有 Cloudflare 代理。国内访问 Vercel 本身就会慢或间歇失败，
   这是「整站偶发打不开」的根因，代码层只能缓解。
2. **D1 走 REST**：每次 Drizzle 查询都是一次到 `api.cloudflare.com` 的 HTTPS 往返
   （`lib/db/d1-http.ts`）。读超时 5s、重试 1 次，单条卡住可拖住整页约 10s。
3. **每页查询数偏高**：顶栏布局约 10 跳（未读 1 + 最近信 1 + 货币条 8），
   仪表盘 10 个聚合并发，任务成就约 30 跳，且任务页原先没有任何 catch。
4. **全站 `force-dynamic`**：只有站点名、终身用量、大奖榜、定价做了短缓存，
   活动配置与券余额每次渲染都重新读。

## 本次改动

- `app/(dashboard)/layout.tsx`：未读、最近信、货币条移进 `<Suspense>`，
  先用同高度顶栏占位，页面正文可以立即流式输出。
- `lib/settings/index.ts`：新增 `getJsonSettings(keys)`，一次 `IN` 查询读多块 JSON 配置。
- `lib/activity/coupons.ts`：`resolveActivity` 改为纯函数解析；券列表、单玩法视图、
  购券路径都把「玩法配置 + 礼包配置」合并到一次查询，货币条 8 → 5 跳。
- `lib/tasks/tasks.ts`：每个统计项与领取记录各自 `.catch`，单项失败只显示 0 进度。
- `lib/cloudflare/http.ts`：超时错误标记 `TimeoutError`，不再重试；
  连接失败与 429/5xx 仍保留一次重试，首屏最坏等待从 ~10s 降到 ~5s。
- `lib/usage/queries.ts`：`getUsageByChannel` 去掉 `leftJoin`
  （见 `docs/fixes/2026-06-25-drizzle-leftjoin-bug.md`），渠道名单独查一次再手动映射。

## 仍待处理（需要运维配合）

- 给域名套 Cloudflare 代理（橙云）或换更近的边缘节点；这是国内「打不开」的根因。
- 真正的大头仍在查询条数：任务成就、仪表盘聚合、钱包页各自 9~30 跳，
  后续可考虑按用户短 TTL 缓存或把同表统计合并成单条 SQL。

## 验证

- `tsc` 全量 0 错误；改动文件 ESLint 0 错误 0 警告；可加载单测 173/173 通过。
- 未在真实浏览器复测登录后的首屏（文档中的测试账号当前无法登录）。
