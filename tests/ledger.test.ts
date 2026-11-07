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
}

function harness(): Harness {
  const queries: Captured[] = [];
  let rows: Record<string, unknown>[] = [];
  const exports: Record<string, unknown> = {};
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      assert.equal(name, "@/lib/db/d1-http", "账本只应依赖 D1 读取入口");
      return {
        d1All: async (sql: string, params: unknown[]) => {
          queries.push({ sql, params });
          return rows;
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

test("13 个发放类型各归一类，漏登记会被问出来", () => {
  const { ledger } = harness();
  const buckets = Object.values(ledger.LEDGER_CATEGORY_TYPES).flat();
  const labelled = Object.keys(ledger.TOPUP_TYPE_LABEL).map(Number);

  assert.deepEqual([...buckets].sort((a, b) => a - b), [...labelled].sort((a, b) => a - b));
  assert.equal(new Set(buckets).size, buckets.length, "同一个 type 不能落进两个类别");
  assert.deepEqual(labelled.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
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
    { date: "2026-11-07", income: 100.004, expense: 33.336, entries: 3 },
    { date: "2026-11-06", income: 0, expense: 0, entries: 2 },
    { date: 2026, income: 1, expense: 1, entries: 1 },
  ]);

  return (async () => {
    const days = await ledger.listLedgerDays("fixture-user", "usage");
    // 2026-11-06 那天既不加钱也不扣钱，不该占一行；缺日期的行（date 非字符串）也不进表。
    // 留在行里的仍是原值：取整只在展示层做一次，逐日取整会让累计差出一分尾数。
    assert.deepEqual(local(days), [{ date: "2026-11-07", income: 100.004, expense: 33.336, entries: 3 }]);

    const { sql, params } = queries[0];
    assert.match(sql, /strftime\('%Y-%m-%d', ts \/ 1000, 'unixepoch', '\+8 hours'\)/);
    assert.match(sql, /GROUP BY date/);
    // 筛选值只能是参数：直接拼进 SQL 就是注入面。
    assert.match(sql, /WHERE category = \?/);
    assert.ok(params.includes("usage"));
    assert.doesNotMatch(sql, /category = 'usage'/);
  })();
});

test("全部类别不追加 WHERE，其他类别追加且参数化", () => {
  const { ledger, queries, setRows } = harness();
  setRows([{ category: "usage", typeCode: 0, entries: 2, income: 0, expense: 5 }]);

  return (async () => {
    await ledger.listLedgerDayByType("fixture-user", { from: 1, to: 2 }, "all");
    assert.doesNotMatch(queries[0].sql, /WHERE category/);

    await ledger.listLedgerDayByType("fixture-user", { from: 1, to: 2 }, "recharge");
    assert.match(queries[1].sql, /WHERE category = \?/);
    assert.ok(queries[1].params.includes("recharge"));

    const rows = await ledger.listLedgerDayByType("fixture-user", { from: 1, to: 2 }, "all");
    assert.deepEqual(local(rows), [{ category: "usage", typeCode: 0, entries: 2, income: 0, expense: 5 }]);
  })();
});

test("天表与当天小计用同一把尺子筛行：都按未取整的原值判定", () => {
  const { ledger, setRows } = harness();
  // 0.006 cr 算进出（界面按 formatCredits 显 0.0060），0.004 不算。两边口径必须一致，
  // 否则会出现「这天列进表里、点开却一行小计都没有」。
  setRows([{ date: "2026-11-07", income: 0.006, expense: 0, entries: 1 }]);

  return (async () => {
    const days = await ledger.listLedgerDays("fixture-user", "all");
    assert.deepEqual(local(days), [{ date: "2026-11-07", income: 0.006, expense: 0, entries: 1 }]);

    setRows([{ category: "reward", typeCode: 3, entries: 1, income: 0.004, expense: 0 }]);
    assert.deepEqual(local(await ledger.listLedgerDayByType("fixture-user", { from: 1, to: 2 })), []);
  })();
});

test("最近收支按 LIMIT 取满，SQL 里已挡掉 0 进出的行", () => {
  const { ledger, queries, setRows } = harness();
  setRows([
    { ts: 11, category: "recharge", typeCode: 5, detail: "在线充值", income: 100, expense: 0, calls: 1 },
    { ts: 10, category: "activity", typeCode: 6, detail: "买券", income: 0, expense: 12.5, calls: 1 },
    { ts: 9, category: "usage", typeCode: 0, detail: "gpt", income: null, expense: undefined, calls: 4 },
  ]);

  return (async () => {
    const entries = await ledger.listRecentLedgerEntries("fixture-user", 3, { from: 1, to: 2 });
    assert.equal(placeholders(queries[0].sql), queries[0].params.length);
    // 超取 3 倍是为了在 JS 里筛 0 行；现在 SQL 已经挡掉，LIMIT 就是实际条数。
    assert.equal(queries[0].params.at(-1), 3);
    assert.match(queries[0].sql, /WHERE ts IS NOT NULL ORDER BY ts DESC LIMIT \?/);
    assert.deepEqual(local(entries.map((entry) => entry.ts)), [11, 10, 9]);
    assert.deepEqual(local(entries[0]), {
      ts: 11,
      category: "recharge",
      typeCode: 5,
      detail: "在线充值",
      income: 100,
      expense: 0,
      calls: 1,
    });
    // 聚合出来的 SUM 可能是 NULL（当天没有该类别的行），不能把 NaN 带进界面。
    assert.equal(entries[2].income, 0);
    assert.equal(entries[2].expense, 0);
  })();
});

test("最近窗口按天回退，右边界是当下", () => {
  const { ledger } = harness();
  const now = Date.parse("2026-11-07T12:00:00+08:00");
  assert.deepEqual(local(ledger.recentWindow(now, 90)), { from: now - 90 * 86_400_000, to: now });
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
  // 余额比账目少 10：到期作废的临时余额没有留底，如实报成差额。
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

test("筛选项与类别登记一致，过期作废不再出现", () => {
  const { ledger } = harness();
  const ids = ledger.LEDGER_FILTERS.map((item) => item.id);
  assert.deepEqual(local(ids), ["all", "recharge", "reward", "activity", "usage"]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    if (id === "all" || id === "usage") continue;
    assert.ok(id in ledger.LEDGER_CATEGORY_TYPES, `${id} 没有登记归属类型`);
  }
});

test("钱包结算剔除过期作废后，有效入账 − 支出 正好等于余额", () => {
  const { ledger } = harness();

  // 线上管理员账号的真实口径：10 亿兑换码过期作废后，剩 5,286,519.43 入账。
  const expiredCase = ledger.ledgerSettlement(56_385.22, {
    income: 1_005_347_280.33,
    expense: 5_230_134.21,
  });
  assert.deepEqual(local(expiredCase), {
    effectiveIncome: 5_286_519.43,
    expense: 5_230_134.21,
    expired: 1_000_060_760.9,
    balance: 56_385.22,
  });
  assert.equal(
    Math.round((expiredCase.effectiveIncome - expiredCase.expense) * 100) / 100,
    expiredCase.balance,
  );

  // 没有过期时口径不变。
  assert.deepEqual(
    local(ledger.ledgerSettlement(100, { income: 150, expense: 50 })),
    { effectiveIncome: 150, expense: 50, expired: 0, balance: 100 },
  );

  // 正差额是账外增加，不能反过来膨胀「有效入账」。
  assert.deepEqual(
    local(ledger.ledgerSettlement(120, { income: 150, expense: 50 })),
    { effectiveIncome: 150, expense: 50, expired: 0, balance: 120 },
  );
});
