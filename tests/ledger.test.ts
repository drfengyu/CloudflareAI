import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

/**
 * 账本口径的回归测试：不连库，把 `lib/billing/ledger.ts` 单独取出来跑，
 * 只替换 `d1All` 这一个边界，检查它到底拼了什么 SQL、绑了什么参数、
 * 以及行数据到界面数字的换算。
 */
const source = readFileSync(new URL("../lib/billing/ledger.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

type Captured = { sql: string; params: unknown[] };

interface Harness {
  ledger: typeof import("@/lib/billing/ledger");
  queries: Captured[];
  setRows: (rows: Record<string, unknown>[]) => void;
  /** 充值渠道回查的固定响应；默认空，表示订单不存在。 */
  setOrderRows: (rows: Record<string, unknown>[]) => void;
}

function harness(): Harness {
  const queries: Captured[] = [];
  let rows: Record<string, unknown>[] = [];
  let orderRows: Record<string, unknown>[] = [];
  const exports: Record<string, unknown> = {};
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      assert.equal(name, "@/lib/db/d1-http", "账本只应依赖 D1 读取入口");
      return {
        d1All: async (sql: string, params: unknown[]) => {
          queries.push({ sql, params });
          return /FROM payment_order/.test(sql) ? orderRows : rows;
        },
      };
    },
  });
  return {
    ledger: exports as unknown as Harness["ledger"],
    queries,
    setRows: (next) => {
      rows = next;
    },
    setOrderRows: (next) => {
      orderRows = next;
    },
  };
}

const placeholders = (sql: string) => (sql.match(/\?/g) ?? []).length;

/**
 * vm 里造出来的数组/对象带的是另一套原型，`deepEqual` 会连构造函数一起比。
 * 比结构之前先过一遍 JSON，把值搬回测试运行环境。
 */
const local = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test("两表 UNION 的占位符与参数数量一致", () => {
  const { ledger } = harness();
  const range = { from: 1_700_000_000_000, to: 1_700_086_400_000 };

  for (const [label, built] of [
    ["全量", ledger.ledgerUnion("fixture-user", null)],
    ["窗口", ledger.ledgerUnion("fixture-user", range)],
  ] as const) {
    assert.equal(
      placeholders(built.sql),
      built.params.length,
      `${label}口径的绑定数量与占位符不一致`,
    );
    // 两个分支各绑一次 userId：topup → usage_log。
    assert.equal(built.params.filter((value) => value === "fixture-user").length, 2);
    assert.doesNotMatch(built.sql, /;|--/, "拼接里不该出现语句分隔或注释");
  }
});

test("参数按分支顺序绑定：topup 的边界在前，usage_log 的在后", () => {
  const { ledger } = harness();

  assert.deepEqual(local(ledger.ledgerUnion("fixture-user", null).params), [
    "fixture-user",
    "fixture-user",
  ]);

  const day = ledger.ledgerUnion("fixture-user", { from: 100, to: 200 });
  assert.deepEqual(local(day.params), ["fixture-user", 100, 200, "fixture-user", 100, 200]);
  assert.equal((day.sql.match(/createdAt >= \? AND createdAt < \?/g) ?? []).length, 2);
  // 临时余额不做账本来源：过期行每天被 cron 整行删掉，读它会改写历史。
  assert.doesNotMatch(day.sql, /temporary_balance|expiresAt/, "账本不该再读临时余额表");
});

test("金额为 0 的发放/调整在 SQL 里就挡掉，不占笔数也不占名额", () => {
  const { ledger } = harness();
  const { sql } = ledger.ledgerUnion("fixture-user", null);
  assert.match(sql, /FROM topup WHERE userId = \? AND amount <> 0/);
  // API 消费靠 creditsUsed > 0 自证非零，失败调用记 0 cr 本就不该进账。
  assert.match(sql, /FROM usage_log WHERE userId = \? AND creditsUsed > 0/);
});

test("15 个流水类型各归一类，漏登记会被问出来", () => {
  const { ledger } = harness();
  const buckets = Object.values(ledger.LEDGER_CATEGORY_TYPES).flat();
  const labelled = Object.keys(ledger.TOPUP_TYPE_LABEL).map(Number);

  assert.deepEqual([...buckets].sort((a, b) => a - b), [...labelled].sort((a, b) => a - b));
  assert.equal(new Set(buckets).size, buckets.length, "同一个 type 不能落进两个类别");
  assert.deepEqual(labelled.sort((a, b) => a - b), [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  ]);
  assert.deepEqual(local(ledger.LEDGER_CATEGORY_TYPES.expire), [ledger.TOPUP_TYPE_EXPIRE]);
  // 活动券兑换是付出 cr 买券，属于活动类目的资金流出。
  assert.ok(ledger.LEDGER_CATEGORY_TYPES.activity.includes(15));
});

test("注册奖励是赠送，不进充值类目", () => {
  const { ledger } = harness();

  assert.equal(ledger.TOPUP_TYPE_LABEL[4], "注册奖励");
  assert.ok(ledger.LEDGER_CATEGORY_TYPES.reward.includes(4), "注册奖励应归入赠送与返利");
  assert.ok(!ledger.LEDGER_CATEGORY_TYPES.recharge.includes(4), "注册奖励不是充值");
  assert.deepEqual(local(ledger.LEDGER_CATEGORY_TYPES.recharge).sort((a, b) => a - b), [
    1, 2, 5, 13,
  ]);
});

test("天表按北京日界分组，类别筛选走占位符", () => {
  const { ledger, queries, setRows } = harness();
  setRows([
    { date: "2026-11-07", category: "usage", income: 60.125, expense: 20.5, entries: 2 },
    { date: "2026-11-07", category: "reward", income: 40.25, expense: 13.375, entries: 1 },
    { date: "2026-11-06", category: "usage", income: 0, expense: 0, entries: 2 },
    { date: 2026, category: "usage", income: 1, expense: 1, entries: 1 },
  ]);

  return (async () => {
    const days = await ledger.listLedgerDays("fixture-user", "usage");
    // 夹具不按类别过滤，两个类别的同日行会折成一行；筛选条件只在 SQL 里校验。
    // 2026-11-06 那天既不加钱也不扣钱，不该占一行；缺日期的行（date 非字符串）也不进表。
    // 留在行里的仍是原值：取整只在展示层做一次，逐日取整会让累计差出一分尾数。
    assert.deepEqual(local(days), [{ date: "2026-11-07", income: 100.375, expense: 33.875, entries: 3 }]);

    const { sql, params } = queries[0];
    assert.match(sql, /strftime\('%Y-%m-%d', ts \/ 1000, 'unixepoch', '\+8 hours'\)/);
    // 日 + 类别分组：同一段历史一次扫描，天表与过期合计共用这份结果。
    assert.match(sql, /GROUP BY date, category/);
    // 筛选值只能是参数：直接拼进 SQL 就是注入面。
    assert.match(sql, /WHERE category = \?/);
    assert.ok(params.includes("usage"));
    assert.doesNotMatch(sql, /category = 'usage'/);
  })();
});

test("同日多类别折成一行，过期合计从天表结果直接折出", () => {
  const { ledger, setRows } = harness();
  setRows([
    { date: "2026-11-07", category: "recharge", income: 100, expense: 0, entries: 1 },
    { date: "2026-11-07", category: "usage", income: 0, expense: 30, entries: 5 },
    { date: "2026-11-06", category: "expire", income: 0, expense: 12.5, entries: 1 },
  ]);

  return (async () => {
    const overview = await ledger.listLedgerOverview("fixture-user");
    assert.deepEqual(local(overview.days), [
      { date: "2026-11-07", income: 100, expense: 30, entries: 6 },
      { date: "2026-11-06", income: 0, expense: 12.5, entries: 1 },
    ]);
    assert.equal(overview.expired, 12.5);
  })();
});

test("全部类别不追加 WHERE，其他类别追加且参数化", () => {
  const { ledger, queries, setRows } = harness();
  setRows([{ category: "usage", typeCode: 0, calls: 2, income: 0, expense: 5 }]);

  return (async () => {
    await ledger.listLedgerDayByType("fixture-user", { from: 1, to: 2 }, "all");
    assert.doesNotMatch(queries[0].sql, /WHERE category/);

    await ledger.listLedgerDayByType("fixture-user", { from: 1, to: 2 }, "recharge");
    assert.match(queries[1].sql, /WHERE category = \?/);
    assert.ok(queries[1].params.includes("recharge"));
    // 当天没有 type=5 行时不去查订单，省一次 D1 往返。
    assert.equal(queries.length, 2);

    const rows = await ledger.listLedgerDayByType("fixture-user", { from: 1, to: 2 }, "all");
    assert.deepEqual(local(rows), [
      {
        category: "usage",
        typeCode: 0,
        subtype: "type-0",
        label: "API 消费",
        entries: 2,
        income: 0,
        expense: 5,
      },
    ]);
  })();
});

test("天表与当天小计用同一把尺子筛行：都按未取整的原值判定", () => {
  const { ledger, setRows } = harness();
  // 0.006 cr 算进出（界面按 formatCredits 显 0.0060），0.004 不算。两边口径必须一致，
  // 否则会出现「这天列进表里、点开却一行小计都没有」。
  setRows([{ date: "2026-11-07", category: "usage", income: 0.006, expense: 0, entries: 1 }]);

  return (async () => {
    const days = await ledger.listLedgerDays("fixture-user", "all");
    assert.deepEqual(local(days), [{ date: "2026-11-07", income: 0.006, expense: 0, entries: 1 }]);

    setRows([{ category: "reward", typeCode: 3, calls: 1, income: 0.004, expense: 0 }]);
    assert.deepEqual(local(await ledger.listLedgerDayByType("fixture-user", { from: 1, to: 2 })), []);
  })();
});

test("最近收支按 5 天窗口取数，SQL 里挡掉过期作废与 0 进出", () => {
  const { ledger, queries, setRows } = harness();
  const now = Date.parse("2026-11-07T12:00:00+08:00");
  setRows([
    {
      ts: Date.parse("2026-11-07T10:00:00+08:00"),
      category: "recharge",
      typeCode: 5,
      detail: "在线充值",
      income: 100,
      expense: 0,
      calls: 1,
    },
    {
      ts: Date.parse("2026-11-07T09:00:00+08:00"),
      category: "usage",
      typeCode: 0,
      detail: "gpt",
      income: null,
      expense: 12.5,
      calls: 4,
    },
    {
      ts: Date.parse("2026-11-06T20:00:00+08:00"),
      category: "activity",
      typeCode: 6,
      detail: "买券",
      income: 0,
      expense: 30,
      calls: 1,
    },
  ]);

  return (async () => {
    const days = await ledger.listRecentLedgerByDay("fixture-user", now);
    assert.equal(placeholders(queries[0].sql), queries[0].params.length);
    // 截断放在 JS 里做：先按类聚合再截断，日小计才会与展开后的分类小计闭合。
    assert.doesNotMatch(queries[0].sql, /LIMIT/);
    assert.match(
      queries[0].sql,
      /WHERE ts IS NOT NULL AND category <> 'expire' ORDER BY ts DESC/,
    );
    assert.deepEqual(local(queries[0].params), [
      "fixture-user",
      Date.parse("2026-11-03T00:00:00+08:00"),
      now,
      "fixture-user",
      Date.parse("2026-11-03T00:00:00+08:00"),
      now,
    ]);

    assert.deepEqual(local(days), [
      {
        date: "2026-11-07",
        entries: 5,
        income: 100,
        expense: 12.5,
        rows: [
          {
            category: "recharge",
            subtype: "online-unknown",
            label: "在线充值",
            entries: 1,
            income: 100,
            expense: 0,
          },
          {
            category: "usage",
            subtype: "type-0",
            label: "API 消费",
            entries: 4,
            income: 0,
            expense: 12.5,
          },
        ],
      },
      {
        date: "2026-11-06",
        entries: 1,
        income: 0,
        expense: 30,
        rows: [
          {
            category: "activity",
            subtype: "type-6",
            label: "幸运转盘",
            entries: 1,
            income: 0,
            expense: 30,
          },
        ],
      },
    ]);
  })();
});

test("最近收支最多 50 笔，按天聚合后小计闭合", () => {
  const { ledger } = harness();
  const now = Date.parse("2026-11-07T12:00:00+08:00");
  const entries = Array.from({ length: 60 }, (_, index) => ({
    ts: now - index * 1000,
    category: "activity" as const,
    typeCode: 6,
    detail: null,
    income: 0,
    expense: 1,
    calls: 1,
  }));

  const days = ledger.groupRecentLedgerDays(entries, 50);
  assert.equal(days.length, 1);
  assert.equal(days[0].date, "2026-11-07");
  assert.equal(days[0].entries, 50);
  assert.equal(days[0].expense, 50);
  assert.deepEqual(local(days[0].rows), [
    { category: "activity", subtype: "type-6", label: "幸运转盘", entries: 50, income: 0, expense: 50 },
  ]);

  // 钱包页传 null（默认）时不截断：近 5 天多少笔就显示多少笔。
  const all = ledger.groupRecentLedgerDays(entries);
  assert.equal(all[0].entries, 60);
  assert.equal(all[0].expense, 60);
});

test("最近窗口是含今天在内的 5 个北京日历日", () => {
  const { ledger } = harness();
  const now = Date.parse("2026-11-07T12:00:00+08:00");
  assert.deepEqual(local(ledger.recentDayWindow(now)), {
    from: Date.parse("2026-11-03T00:00:00+08:00"),
    to: now,
  });
  // 北京时间 11-07 00:30 仍属于 11-07，而不是 UTC 的 11-06。
  assert.equal(ledger.cnDateOf(Date.parse("2026-11-06T16:30:00Z")), "2026-11-07");
});

test("金额为 0 的行不算进出", () => {
  const { ledger } = harness();
  assert.equal(ledger.ledgerHasMovement({ income: 0, expense: 0 }), false);
  assert.equal(ledger.ledgerHasMovement({ income: 0.004, expense: 0 }), false, "不到半分的尾差按 0 处理");
  assert.equal(ledger.ledgerHasMovement({ income: 0, expense: 0.006 }), true);
  assert.equal(ledger.ledgerHasMovement({ income: 5, expense: 5 }), true);
});

test("汇总保持原值，净收支与差额才在展示层取整", () => {
  const { ledger } = harness();
  const totals = ledger.sumLedgerDays([
    { income: 100.004, expense: 0.1 },
    { income: 0.006, expense: 0.2 },
  ]);
  assert.ok(Math.abs(totals.income - 100.01) < 1e-9, "逐行取整会把这一分尾差抹掉，累计就与余额差一分");
  assert.ok(Math.abs(totals.expense - 0.3) < 1e-9);
  assert.equal(ledger.ledgerNet(totals), 99.71);
  // 余额比账目少 10：差额如实保留（历史遗留或缺口），不再反推成过期作废。
  assert.equal(ledger.ledgerGap(89.71, totals), -10);
  assert.equal(ledger.ledgerGap(totals.income - totals.expense, totals), 0);
});

test("北京日界：非法与未来日期一律拒绝", () => {
  const { ledger } = harness();
  const now = Date.parse("2026-11-07T00:00:00+08:00");
  assert.deepEqual(local(ledger.cnDayRange("2026-11-07", now)), { from: now, to: now + 86_400_000 });

  for (const bad of ["2026-13-99", "11-07", "", "2026-11-07T00:00:00Z"]) {
    assert.equal(ledger.cnDayRange(bad, now), null, `${bad} 应被拒绝`);
  }
  assert.equal(ledger.cnDayRange("2026-11-08", now), null, "未来日期不该放行");
  assert.notEqual(ledger.cnDayRange("2026-11-08", now + 86_400_000), null);
});

test("类型名与条目名：API 消费带次数，缺名字时不写 undefined", () => {
  const { ledger } = harness();
  assert.equal(ledger.ledgerTypeLabel({ category: "usage", typeCode: 0 }), "API 消费");
  assert.equal(ledger.ledgerTypeLabel({ category: "recharge", typeCode: 5 }), "在线充值");
  assert.equal(ledger.ledgerTypeLabel({ category: "reward", typeCode: 99 }), "其他");

  const base = { ts: 1, category: "usage" as const, typeCode: 0, detail: null, income: 0, expense: 1, calls: 1 };
  assert.equal(ledger.ledgerEntryLabel(base), "API 消费");
  assert.equal(ledger.ledgerEntryLabel({ ...base, detail: "gpt-4o", calls: 12 }), "API 消费 · gpt-4o × 12");
  assert.equal(ledger.ledgerEntryLabel({ ...base, category: "reward", typeCode: 3 }), "签到奖励");
});

test("过期作废按流水描述还原发放来源", () => {
  const { ledger } = harness();
  const cases: [string | null, string][] = [
    ["临时余额过期作废：兑换码充值: ABCD", "兑换码到期"],
    ["临时余额过期作废：幸运转盘抽奖奖励 100 cr", "转盘赠送到期"],
    ["临时余额过期作废：限时活动抽奖奖励 200 cr", "转盘赠送到期"],
    ["临时余额过期作废：翻牌夺宝 第 3 张中奖 +200 cr", "翻牌夺宝到期"],
    ["临时余额过期作废：每日签到奖励 5 cr", "签到赠送到期"],
    ["临时余额过期作废：历史补记：充值赠送 10 cr", "充值赠送到期"],
    ["历史补记：兑换码 ABCD 的临时余额到期作废", "兑换码到期（补记）"],
    ["历史补记：过期临时余额等未入账扣减，无法逐笔还原", "历史补记"],
    [null, "其他临时余额到期"],
  ];
  for (const [detail, label] of cases) {
    assert.equal(ledger.ledgerExpireSubtype(detail).label, label, `${detail} 应归为 ${label}`);
  }
});

test("充值细分按订单渠道与模拟回调标注", () => {
  const { ledger } = harness();
  const orders = new Map([
    ["TUALIPAY", { channel: "alipay", simulated: false }],
    ["TUMOCK", { channel: "alipay", simulated: true }],
    ["TUWECHAT", { channel: "wechat", simulated: true }],
    ["TULINUXDO", { channel: "linuxdo", simulated: false }],
  ]);

  assert.deepEqual(local(ledger.ledgerRechargeSubtype(1, "兑换码充值: X", orders)), {
    subtype: "type-1",
    label: "兑换码充值",
  });
  assert.deepEqual(local(ledger.ledgerRechargeSubtype(2, "管理员手动充值", orders)), {
    subtype: "type-2",
    label: "管理员调整",
  });
  assert.deepEqual(
    local(ledger.ledgerRechargeSubtype(5, "在线充值 ¥10（订单 TUALIPAY）", orders)),
    { subtype: "alipay", label: "支付宝支付" },
  );
  assert.deepEqual(
    local(ledger.ledgerRechargeSubtype(5, "在线充值 ¥10（订单 TUMOCK）", orders)),
    { subtype: "alipay-mock", label: "支付宝模拟" },
  );
  assert.deepEqual(
    local(ledger.ledgerRechargeSubtype(5, "在线充值 10 积分（订单 TUWECHAT）", orders)),
    { subtype: "wechat-mock", label: "微信模拟" },
  );
  assert.deepEqual(
    local(ledger.ledgerRechargeSubtype(5, "在线充值 10 积分（订单 TULINUXDO）", orders)),
    { subtype: "linuxdo", label: "LinuxDO 积分" },
  );
  assert.deepEqual(
    local(ledger.ledgerRechargeSubtype(5, "在线充值 ¥10（订单 TUNKNOWN）", orders)),
    { subtype: "online-unknown", label: "在线充值" },
  );
});

test("当天分类把过期来源与充值渠道拆成多行，金额与笔数不变", () => {
  const { ledger, queries, setRows, setOrderRows } = harness();
  setOrderRows([
    { orderNo: "TUMOCK", channel: "alipay", notifyType: "mock" },
    { orderNo: "TUALIPAY", channel: "alipay", notifyType: null },
  ]);
  setRows([
    { category: "recharge", typeCode: 5, detail: "在线充值 ¥128（订单 TUMOCK）", income: 100, expense: 0, calls: 1 },
    { category: "recharge", typeCode: 5, detail: "在线充值 ¥10（订单 TUALIPAY）", income: 50, expense: 0, calls: 1 },
    { category: "expire", typeCode: 14, detail: "临时余额过期作废：兑换码充值: X", income: 0, expense: 30, calls: 1 },
    { category: "expire", typeCode: 14, detail: "临时余额过期作废：幸运转盘抽奖奖励 5 cr", income: 0, expense: 20, calls: 1 },
  ]);

  return (async () => {
    const rows = await ledger.listLedgerDayByType("fixture-user", { from: 1, to: 2 }, "all");
    const byLabel = Object.fromEntries(local(rows).map((row) => [row.label, row]));
    assert.deepEqual(byLabel["支付宝模拟"], {
      category: "recharge",
      typeCode: 5,
      subtype: "alipay-mock",
      label: "支付宝模拟",
      entries: 1,
      income: 100,
      expense: 0,
    });
    assert.deepEqual(byLabel["兑换码到期"], {
      category: "expire",
      typeCode: 14,
      subtype: "兑换码到期-live",
      label: "兑换码到期",
      entries: 1,
      income: 0,
      expense: 30,
    });

    const lookup = queries.find((item) => /FROM payment_order/.test(item.sql));
    assert.ok(lookup, "有 type=5 行时必须回查订单渠道");
    assert.equal(placeholders(lookup.sql), lookup.params.length);
    assert.deepEqual(local(lookup.params).sort(), ["TUALIPAY", "TUMOCK"]);
  })();
});

test("筛选项与类别登记一致，过期作废走真实天表", () => {
  const { ledger, queries, setRows } = harness();
  const ids = ledger.LEDGER_FILTERS.map((item) => item.id);
  assert.deepEqual(local(ids), ["all", "recharge", "reward", "activity", "expire", "usage"]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    // API 消费走用量表；其余类别都必须有 topup.type 归属。
    if (id === "all" || id === "usage") continue;
    assert.ok(id in ledger.LEDGER_CATEGORY_TYPES, `${id} 没有登记归属类型`);
  }

  return (async () => {
    // 过期作废是 cron 补记的真实负流水，筛选它就查天表，和其它类别同一条路。
    setRows([{ date: "2026-06-24", category: "expire", income: 0, expense: 1_000_000_000, entries: 1 }]);
    const days = await ledger.listLedgerDays("fixture-user", "expire");
    assert.deepEqual(local(days), [
      { date: "2026-06-24", income: 0, expense: 1_000_000_000, entries: 1 },
    ]);
    assert.match(queries[0].sql, /WHERE category = \?/);
    assert.ok(queries[0].params.includes("expire"));
    assert.match(queries[0].sql, /type IN \(14\)/);
  })();
});

test("过期作废合计从天表同一把尺子折出，空值与负值按 0 处理", () => {
  const { ledger, queries, setRows } = harness();

  return (async () => {
    setRows([
      { date: "2026-06-24", category: "expire", income: 0, expense: 1_000_000_000, entries: 1 },
    ]);
    assert.equal((await ledger.listLedgerOverview("fixture-user")).expired, 1_000_000_000);
    // 和天表同一次扫描，不再单独 SUM 一遍 topup。
    assert.match(queries[0].sql, /GROUP BY date, category/);
    assert.doesNotMatch(queries[0].sql, /AND amount < 0/);

    // SUM 为 NULL / 异常负值时按 0 处理，钱包不会出现 NaN 或负的「过期」。
    setRows([{ date: "2026-06-24", category: "expire", income: 0, expense: null, entries: 1 }]);
    assert.equal((await ledger.listLedgerOverview("fixture-user")).expired, 0);
    setRows([{ date: "2026-06-24", category: "expire", income: 0, expense: -5, entries: 1 }]);
    assert.equal((await ledger.listLedgerOverview("fixture-user")).expired, 0);
  })();
});

test("钱包结算剔除真实过期流水后，剩余差额如实保留", () => {
  const { ledger } = harness();

  // 线上管理员账号补记 10 亿兑换码过期后的口径：两头各剔 10 亿，净额不变，
  // 与余额仍差 60,760.90 是 2026-11-07 前的历史遗留。
  const expiredCase = ledger.ledgerSettlement(
    56_385.22,
    { income: 1_005_347_280.33, expense: 1_005_230_134.21 },
    1_000_000_000,
  );
  assert.deepEqual(local(expiredCase), {
    effectiveIncome: 5_347_280.33,
    expense: 5_230_134.21,
    expired: 1_000_000_000,
    balance: 56_385.22,
    gap: -60_760.9,
    reconciled: false,
  });

  // 2026-11-07 历史补记后的线上口径：合计带半分以下尾数。
  // 若先把过期总额取整再相减，有效入账与支出会各偏 0.01，钱包三笔数就闭不上。
  assert.deepEqual(
    local(
      ledger.ledgerSettlement(
        56_385.215861,
        { income: 1_005_347_280.331604, expense: 1_005_290_895.115743 },
        1_000_060_760.903216,
      ),
    ),
    {
      effectiveIncome: 5_286_519.43,
      expense: 5_230_134.21,
      expired: 1_000_060_760.9,
      balance: 56_385.22,
      gap: 0,
      reconciled: true,
    },
  );

  // 顶部四格同样按分闭合：收入与余额取整后，支出倒推，差一分只落在展示层。
  const shown = ledger.ledgerDisplayTotals(
    { income: 1_005_347_280.331604, expense: 1_005_290_895.115743 },
    56_385.215861,
  );
  assert.deepEqual(local(shown), {
    income: 1_005_347_280.33,
    expense: 1_005_290_895.11,
  });
  assert.equal(ledger.ledgerNet(shown), 56_385.22);

  // 没有过期时口径不变，也没有差额。
  assert.deepEqual(
    local(ledger.ledgerSettlement(100, { income: 150, expense: 50 }, 0)),
    { effectiveIncome: 150, expense: 50, expired: 0, balance: 100, gap: 0, reconciled: true },
  );

  // 账本完全对上时，剔除过期前后应当都平。
  assert.equal(
    ledger.ledgerSettlement(
      100,
      { income: 1_150, expense: 1_050 },
      1_000,
    ).reconciled,
    true,
  );

  // 正差额是账外增加，不能反过来膨胀「有效入账」，也不能谎称已对平。
  assert.deepEqual(
    local(ledger.ledgerSettlement(120, { income: 150, expense: 50 }, 0)),
    { effectiveIncome: 150, expense: 50, expired: 0, balance: 120, gap: 20, reconciled: false },
  );

  // 不足一分的过期尾差按 0 计，不会让钱包多出一行「过期 0.00 cr」。
  assert.equal(ledger.ledgerSettlement(0, { income: 0.004, expense: 0 }, 0.004).expired, 0);
});
