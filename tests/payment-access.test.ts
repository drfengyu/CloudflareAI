import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../app/(dashboard)/wallet/actions.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(role: number | null) {
  const state = { role, signedIn: true, readFails: false, orders: 0, roleReads: 0, rateChecks: 0 };
  const userTable = { id: "user.id", role: "user.role" };
  const mocks: Record<string, unknown> = {
    "@/lib/db/d1-http": {
      db: {
        select: () => ({
          from: (table: unknown) => {
            assert.equal(table, userTable);
            return {
              where: (condition: unknown) => {
                assert.deepEqual(condition, ["user.id", "fixture-user"]);
                return {
                  limit: async () => {
                    state.roleReads++;
                    if (state.readFails) throw new Error("database unavailable");
                    return state.role === null ? [] : [{ role: state.role }];
                  },
                };
              },
            };
          },
        }),
      },
    },
    "@/lib/db/schema": { users: userTable },
    "drizzle-orm": { eq: (field: unknown, value: unknown) => [field, value] },
    "@/lib/usage/meter": {
      requireUser: async () => {
        if (!state.signedIn) throw new Error("not signed in");
        return "fixture-user";
      },
    },
    "next/cache": {},
    "next/headers": { headers: async () => new Map([["host", "localhost:3107"]]) },
    "@/lib/payment/epay": {
      getEpayConfig: async () => ({ enabled: true }),
      buildEpayPayUrl: () => ({ url: "https://epay.fixture.invalid/checkout" }),
    },
    "@/lib/payment/linuxdo": {
      getLinuxdoConfig: async () => ({ enabled: true }),
      buildLinuxdoPayUrl: () => ({ url: "https://linuxdo.fixture.invalid/checkout" }),
    },
    "@/lib/payment/order": {
      createRechargeOrder: async () => {
        state.orders++;
        return { orderNo: "fixture-order", credits: 10 };
      },
    },
    "@/lib/payment/pay-order-view": {},
    "@/lib/billing/grant-expiry": {},
    "@/lib/date": {},
    "@/lib/rate-limit": { checkRateLimit: async () => { state.rateChecks++; return true; } },
  };
  const exports: { createPayOrder?: (amount: number, channel: string) => Promise<{ payUrl: string }> } = {};
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected import: ${name}`);
      return mocks[name];
    },
  });
  assert.ok(exports.createPayOrder);
  return { state, createPayOrder: exports.createPayOrder };
}

for (const channel of ["alipay", "wechat", "qqpay"]) {
  test(`普通用户不能直接创建 ${channel} 订单`, async () => {
    for (const role of [0, 1, 9, null]) {
      const { state, createPayOrder } = fixture(role);
      await assert.rejects(createPayOrder(10, channel), /仅限管理员/);
      assert.equal(state.orders, 0);
      assert.equal(state.rateChecks, 0);
    }
  });

  test(`管理员和超级管理员仍可创建 ${channel} 订单`, async () => {
    for (const role of [10, 100]) {
      const { state, createPayOrder } = fixture(role);
      const result = await createPayOrder(10, channel);
      assert.equal(result.payUrl, "https://epay.fixture.invalid/checkout");
      assert.equal(state.orders, 1);
      assert.equal(state.roleReads, 1);
    }
  });
}

test("普通用户 LinuxDO 充值不受管理员限制", async () => {
  const { state, createPayOrder } = fixture(1);
  const result = await createPayOrder(10, "linuxdo");
  assert.equal(result.payUrl, "https://linuxdo.fixture.invalid/checkout");
  assert.equal(state.orders, 1);
  assert.equal(state.roleReads, 0);
});

test("每次下单重查数据库角色，降权立即拒绝", async () => {
  const { state, createPayOrder } = fixture(10);
  await createPayOrder(10, "alipay");
  state.role = 1;
  await assert.rejects(createPayOrder(10, "alipay"), /仅限管理员/);
  assert.equal(state.orders, 1);
  assert.equal(state.roleReads, 2);
});

test("角色读取失败、未登录和伪造渠道均不能创建订单", async () => {
  const { state, createPayOrder } = fixture(100);
  state.readFails = true;
  await assert.rejects(createPayOrder(10, "alipay"), /database unavailable/);
  state.signedIn = false;
  await assert.rejects(createPayOrder(10, "linuxdo"), /not signed in/);
  state.signedIn = true;
  await assert.rejects(createPayOrder(10, "ALIPAY"), /不支持的支付渠道/);
  assert.equal(state.orders, 0);
});
