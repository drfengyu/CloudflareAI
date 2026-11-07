import assert from "node:assert/strict";
import { test } from "node:test";
import {
  rechargeAmountError,
  rechargeCredits,
  rechargeRatePercent,
} from "../lib/payment/recharge-display";

test("到账 cr 与订单结算同口径：金额 × 汇率，向下取整到分", () => {
  assert.equal(rechargeCredits(10, 7.1), 71);
  assert.equal(rechargeCredits(30, 7.1), 213);
  assert.equal(rechargeCredits(0.01, 7.1), 0.07);
  assert.equal(rechargeCredits(1, 1), 1);
});

test("无效金额或汇率一律按 0 展示，不把 NaN 带进界面", () => {
  assert.equal(rechargeCredits(NaN, 7.1), 0);
  assert.equal(rechargeCredits(10, 0), 0);
  assert.equal(rechargeCredits(-10, 7.1), 0);
  assert.equal(rechargeCredits(10, NaN), 0);
});

test("汇率角标按百分比取整：7.1 → 710", () => {
  assert.equal(rechargeRatePercent(7.1), 710);
  assert.equal(rechargeRatePercent(7.15), 715);
  assert.equal(rechargeRatePercent(1), 100);
  assert.equal(rechargeRatePercent(0), 0);
  assert.equal(rechargeRatePercent(NaN), 0);
});

test("前后端充值上下限文案一致", () => {
  assert.equal(rechargeAmountError(0, 1, 1000, "元"), "请输入充值金额");
  assert.equal(rechargeAmountError(NaN, 1, 1000, "元"), "请输入充值金额");
  assert.equal(rechargeAmountError(0.5, 1, 1000, "元"), "单笔最低 1 元");
  assert.equal(rechargeAmountError(1001, 1, 1000, "元"), "单笔最高 1000 元");
  assert.equal(rechargeAmountError(10, 10, 1000000, "积分"), null);
});
