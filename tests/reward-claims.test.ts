import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeTierKey, sanitizeBonusTiers } from "../lib/payment/bonus";

test("档位键按门槛金额规范化：改赠送额度不影响已发记录", () => {
  assert.equal(normalizeTierKey(50), "50");
  assert.equal(normalizeTierKey(49.999), "50");
  assert.equal(normalizeTierKey(10.1), "10.1");
  assert.equal(normalizeTierKey(10.01), "10.01");
});

test("脏档位被丢弃、同门槛只留第一条、按门槛升序", () => {
  const tiers = sanitizeBonusTiers([
    { minCny: 100, bonus: 600 },
    { minCny: "50", bonus: "200" },
    { minCny: 50, bonus: 999 },
    { minCny: 0, bonus: 10 },
    { minCny: 20, bonus: -1 },
    { minCny: "abc", bonus: 10 },
    null,
    "not-an-object",
  ]);
  assert.deepEqual(tiers, [
    { minCny: 50, bonus: 200 },
    { minCny: 100, bonus: 600 },
  ]);
});

test("非数组输入退空，最多保留 20 档", () => {
  assert.deepEqual(sanitizeBonusTiers(null), []);
  assert.deepEqual(sanitizeBonusTiers({ minCny: 10, bonus: 1 }), []);
  const many = Array.from({ length: 25 }, (_, i) => ({ minCny: i + 1, bonus: 10 }));
  assert.equal(sanitizeBonusTiers(many).length, 20);
});