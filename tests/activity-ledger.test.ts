import assert from "node:assert/strict";
import test from "node:test";
import {
  activityKeyForRow,
  foldActivitySections,
  sumSections,
  type ActivityLedgerRawRow,
} from "@/lib/activity/ledger-report";

const row = (
  partial: Partial<ActivityLedgerRawRow> & Pick<ActivityLedgerRawRow, "activityKey" | "date">,
): ActivityLedgerRawRow => ({
  userId: null,
  name: null,
  email: null,
  income: 0,
  expense: 0,
  entries: 1,
  ...partial,
});

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

test("按活动分段：同活动同日同人相加，天数与人数正确，活动时段取首末日", () => {
  const sections = foldActivitySections([
    row({ activityKey: "trial", date: "2026-11-12", userId: "u1", name: "阿岚", income: 5 }),
    row({ activityKey: "trial", date: "2026-11-12", userId: "u1", name: "阿岚", expense: 2 }),
    row({ activityKey: "trial", date: "2026-11-10", userId: "u2", email: "b@example.com", income: 3 }),
    row({ activityKey: "lottery", date: "2026-11-11", userId: "u1", name: "阿岚", income: 100 }),
  ]);

  assert.deepEqual(
    sections.map((section) => section.key),
    ["trial", "lottery"],
  );
  const trial = sections[0];
  assert.equal(trial.income, 8);
  assert.equal(trial.expense, 2);
  assert.equal(trial.entries, 3);
  assert.equal(trial.users, 2);
  assert.equal(trial.firstDate, "2026-11-10");
  assert.equal(trial.lastDate, "2026-11-12");
  assert.deepEqual(
    trial.days.map((day) => [day.date, day.income, day.expense]),
    [
      ["2026-11-12", 5, 2],
      ["2026-11-10", 3, 0],
    ],
  );
  assert.deepEqual(
    trial.userRows.map((user) => [user.userId, user.income, user.expense]),
    [
      ["u1", 5, 2],
      ["u2", 3, 0],
    ],
  );
  assert.equal(trial.userRows[1].label, "b@example.com");
});

test("不足半分的流水不进入分段；未知键落到未归属", () => {
  const sections = foldActivitySections([
    row({ activityKey: "trial", date: "2026-11-12", userId: "u1", income: 0.004 }),
    row({ activityKey: "mystery", date: "2026-11-12", userId: "u2", expense: 2 }),
  ]);

  assert.equal(sections.length, 1);
  assert.equal(sections[0].key, "other");
  assert.equal(sections[0].label, "未归属活动券");
  assert.equal(sections[0].expense, 2);
});

test("全站总计按活动相加，人数跨活动去重", () => {
  const rows = [
    row({ activityKey: "trial", date: "2026-11-12", userId: "u1", income: 5 }),
    row({ activityKey: "lottery", date: "2026-11-12", userId: "u1", income: 100, expense: 40 }),
    row({ activityKey: "lottery", date: "2026-11-11", userId: "u2", income: 20 }),
  ];
  const sections = foldActivitySections(rows);
  assert.deepEqual(sumSections(sections, rows), {
    income: 125,
    expense: 40,
    entries: 3,
    users: 2,
  });
});
