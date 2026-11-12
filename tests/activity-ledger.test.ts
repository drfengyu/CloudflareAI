import assert from "node:assert/strict";
import test from "node:test";
import {
  activityKeyForRow,
  foldActivityLedger,
  sumActivityLedger,
} from "@/lib/activity/ledger-report";

test("奖励流水按类型直接归属", () => {
  assert.equal(activityKeyForRow(17, null), "trial");
  assert.equal(activityKeyForRow(18, null), "workshop");
  assert.equal(activityKeyForRow(19, null), "collection");
  assert.equal(activityKeyForRow(6, null), "lottery");
  assert.equal(activityKeyForRow(12, null), "flip");
  assert.equal(activityKeyForRow(11, null), "raiden");
});

test("共用的兑换 / 礼包流水按描述里的活动名归属", () => {
  assert.equal(activityKeyForRow(15, "兑换试金券 3 张（15 cr 等值，每日试炼）"), "trial");
  assert.equal(activityKeyForRow(16, "购买珍宝礼包赠送 tcr（灵宠工坊）"), "workshop");
  assert.equal(activityKeyForRow(15, "兑换星匣券 1 张（2 cr 等值，星匣图鉴）"), "collection");
  assert.equal(activityKeyForRow(15, "兑换星轨券 2 张（4000 cr 等值，幸运转盘）"), "lottery");
  assert.equal(activityKeyForRow(15, "兑换翻云券 1 张（1000 cr 等值，翻牌夺宝）"), "flip");
  assert.equal(activityKeyForRow(15, "兑换雷霆券 1 张（100 cr 等值，雷电行动）"), "raiden");
});

test("识别不到的共用流水落入未归属，其他类型返回 null", () => {
  assert.equal(activityKeyForRow(15, "兑换活动券 1 张"), "other");
  assert.equal(activityKeyForRow(15, null), "other");
  assert.equal(activityKeyForRow(7, "邀请返利"), null);
  assert.equal(activityKeyForRow(14, "过期作废"), null);
});

test("同日同活动合并，跨日倒序，活动按固定顺序排列", () => {
  const days = foldActivityLedger([
    { date: "2026-11-11", activityKey: "lottery", income: 0, expense: 10, entries: 1 },
    { date: "2026-11-12", activityKey: "lottery", income: 20, expense: 0, entries: 1 },
    { date: "2026-11-12", activityKey: "trial", income: 5, expense: 0, entries: 1 },
    { date: "2026-11-12", activityKey: "lottery", income: 0, expense: 3, entries: 1 },
  ]);

  assert.deepEqual(
    days.map((day) => day.date),
    ["2026-11-12", "2026-11-11"],
  );
  const today = days[0];
  assert.deepEqual(today.cells.map((cell) => cell.key), ["trial", "lottery"]);
  assert.equal(today.income, 25);
  assert.equal(today.expense, 3);
  assert.equal(today.entries, 3);

  const lottery = today.cells.find((cell) => cell.key === "lottery");
  assert.ok(lottery);
  assert.equal(lottery.income, 20);
  assert.equal(lottery.expense, 3);
  assert.equal(lottery.entries, 2);
});

test("不足半分的行不进入天表；未知键落到未归属", () => {
  const days = foldActivityLedger([
    { date: "2026-11-12", activityKey: "trial", income: 0.004, expense: 0, entries: 1 },
    { date: "2026-11-12", activityKey: "mystery", income: 0, expense: 2, entries: 1 },
  ]);

  assert.equal(days.length, 1);
  assert.deepEqual(days[0].cells.map((cell) => cell.key), ["other"]);
  assert.equal(days[0].income, 0);
  assert.equal(days[0].expense, 2);
});

test("窗口合计等于逐日相加", () => {
  const days = foldActivityLedger([
    { date: "2026-11-12", activityKey: "trial", income: 5, expense: 2, entries: 2 },
    { date: "2026-11-11", activityKey: "workshop", income: 0, expense: 3.5, entries: 1 },
  ]);
  assert.deepEqual(sumActivityLedger(days), { income: 5, expense: 5.5, entries: 3 });
});
