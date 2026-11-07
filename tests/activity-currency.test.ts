import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cashbackTierKey,
  DEFAULT_CASHBACK_TIERS,
  rollCashbackReward,
  sanitizeCashbackTiers,
} from "../lib/cashback/config";
import { ACTIVITY_KINDS, COUPON_PACKS, couponNameFor } from "../lib/activity/coupons";
import {
  DAILY_MILESTONES,
  DAILY_TASKS,
  WEEKLY_MILESTONES,
  WEEKLY_TASKS,
  rollMilestoneReward,
  weeklyStartDate,
} from "../lib/tasks/tasks";

/** 按顺序吐出预设随机值，用完之后固定返回最后一个。 */
function queued(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0;
}

test("消费返利：档位清洗去重、排序并跟随门槛生成键", () => {
  const tiers = sanitizeCashbackTiers([
    { minCredits: 2000, minReward: 20, maxReward: 200 },
    { minCredits: "500", minReward: "10", maxReward: "100" },
    { minCredits: 500, minReward: 999, maxReward: 999 },
    { minCredits: 0, minReward: 10, maxReward: 20 },
    { minCredits: 100, minReward: 10, maxReward: 5 },
  ]);
  assert.deepEqual(
    tiers.map((tier) => tier.minCredits),
    [500, 2000],
  );
  assert.equal(cashbackTierKey(499.999), "500");
  assert.equal(cashbackTierKey(10.005), "10.01");
});

test("消费返利：推荐默认五档按门槛递增且最高档封顶 1200", () => {
  assert.equal(DEFAULT_CASHBACK_TIERS.length, 5);
  for (let i = 1; i < DEFAULT_CASHBACK_TIERS.length; i += 1) {
    const prev = DEFAULT_CASHBACK_TIERS[i - 1];
    const curr = DEFAULT_CASHBACK_TIERS[i];
    assert.ok(curr.minCredits > prev.minCredits);
    assert.ok(curr.minReward >= prev.minReward);
    assert.ok(curr.maxReward >= prev.maxReward);
  }
  assert.equal(DEFAULT_CASHBACK_TIERS.at(-1)?.maxReward, 1200);
});

test("消费返利：随机形态按阈值落到货币 / 券 / 抽奖券", () => {
  const tier = { minCredits: 500, minReward: 10, maxReward: 100 };
  const couponTarget = {
    kind: "lottery" as const,
    activityKey: "2026-11-01~2026-11-30",
    couponName: "星轨券",
  };

  const temp = rollCashbackReward(tier, couponTarget, queued(0.1, 0.5));
  assert.equal(temp.kind, "temp_credits");
  assert.ok(temp.credits >= 10 && temp.credits <= 100);

  const permanent = rollCashbackReward(tier, couponTarget, queued(0.5, 0));
  assert.equal(permanent.kind, "permanent_credits");
  assert.equal(permanent.credits, 10);

  const coupon = rollCashbackReward(tier, couponTarget, queued(0.8, 1));
  assert.equal(coupon.kind, "coupon");
  assert.equal(coupon.coupon?.activityKey, couponTarget.activityKey);
  assert.equal(coupon.credits, 100);

  const tickets = rollCashbackReward(tier, couponTarget, queued(0.95, 0.5, 0.99));
  assert.equal(tickets.kind, "tickets");
  assert.equal(tickets.tickets, 3);
  assert.equal(tickets.credits, 0);
});

test("消费返利：没有开着的活动时券奖励降级为临时货币", () => {
  const tier = { minCredits: 20000, minReward: 200, maxReward: 1200 };
  const reward = rollCashbackReward(tier, null, queued(0.85, 0.75));
  assert.equal(reward.kind, "temp_credits");
  assert.ok(reward.credits >= 200 && reward.credits <= 1200);
  assert.match(reward.label, /临时货币/);
});

test("消费返利：金额始终夹在配置区间内", () => {
  const tier = { minCredits: 5000, minReward: 50, maxReward: 400 };
  for (const roll of [0, 0.25, 0.5, 0.999]) {
    const reward = rollCashbackReward(tier, null, queued(0.1, roll));
    assert.ok(reward.credits >= 50 && reward.credits <= 400);
  }
});

test("活动券：同一轮次名字稳定，三种活动各自有券", () => {
  for (const kind of ACTIVITY_KINDS) {
    const name = couponNameFor(kind, "2026-11-01~2026-11-30");
    assert.equal(name, couponNameFor(kind, "2026-11-01~2026-11-30"));
    assert.ok(name.length > 0);
  }
  assert.notEqual(
    couponNameFor("lottery", "2026-11-01~2026-11-30"),
    couponNameFor("flip", "2026-11-01~2026-11-30"),
  );
});

test("珍宝礼包：三档比例固定为 200% / 500% / 1000%", () => {
  assert.deepEqual(
    COUPON_PACKS.map((pack) => [pack.key, pack.priceCredits, pack.ratio]),
    [
      ["small", 10, 2],
      ["medium", 50, 5],
      ["large", 100, 10],
    ],
  );
});

test("任务：每日 100 活跃度、每周 300 活跃度，里程碑末尾对齐上限", () => {
  const dailyPoints = DAILY_TASKS.reduce((sum, task) => sum + task.points, 0);
  const weeklyPoints = WEEKLY_TASKS.reduce((sum, task) => sum + task.points, 0);
  assert.equal(dailyPoints, 100);
  assert.equal(weeklyPoints, 300);
  assert.equal(DAILY_MILESTONES.at(-1)?.points, 100);
  assert.equal(WEEKLY_MILESTONES.at(-1)?.points, 300);
  assert.deepEqual(
    DAILY_MILESTONES.map((item) => item.points),
    [25, 50, 75, 100],
  );
});

test("任务：周一开始日期按北京墙钟计算", () => {
  assert.equal(weeklyStartDate("2026-11-02"), "2026-11-02"); // 周一
  assert.equal(weeklyStartDate("2026-11-07"), "2026-11-02"); // 周六
  assert.equal(weeklyStartDate("2026-11-08"), "2026-11-02"); // 周日
  assert.equal(weeklyStartDate("2026-11-09"), "2026-11-09"); // 下周一
  assert.equal(weeklyStartDate("2026-01-01"), "2025-12-29"); // 跨年
});

test("任务：里程碑随机奖励在区间内且逐档递增", () => {
  for (const milestone of [...DAILY_MILESTONES, ...WEEKLY_MILESTONES]) {
    for (const roll of [0, 0.5, 0.999]) {
      const reward = rollMilestoneReward(milestone, queued(roll, roll));
      assert.ok(reward.credits >= milestone.min && reward.credits <= milestone.max);
      assert.ok(reward.kind === "temp_credits" || reward.kind === "permanent_credits");
    }
  }
  for (let i = 1; i < WEEKLY_MILESTONES.length; i += 1) {
    assert.ok(WEEKLY_MILESTONES[i].min > WEEKLY_MILESTONES[i - 1].min);
  }
});
