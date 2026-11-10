import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cashbackTierKey,
  DEFAULT_CASHBACK_TIERS,
  rollCashbackReward,
  sanitizeCashbackTiers,
} from "../lib/cashback/config";
import {
  ACTIVITY_KINDS,
  buildCouponPacks,
  couponNameFor,
  packGrant,
} from "../lib/activity/coupons";
import {
  DEFAULT_COUPON_PACK_CONFIG,
  sanitizeCouponPackConfig,
} from "../lib/activity/pack-config";
import {
  DEFAULT_LOTTERY_CONFIG,
  sanitizeLotteryConfig,
} from "../lib/lottery/prize-math";
import { DEFAULT_FLIP_CONFIG, sanitizeFlipConfig } from "../lib/flip/config";
import { DEFAULT_RAIDEN_CONFIG, sanitizeRaidenConfig } from "../lib/raiden/config";
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

test("珍宝礼包：默认 200% / 500% / 1000%，倍率与限购可配置、0 = 不限", () => {
  assert.deepEqual(
    buildCouponPacks(DEFAULT_COUPON_PACK_CONFIG).map((pack) => [
      pack.key,
      pack.priceCredits,
      pack.ratioPercent,
      pack.dailyLimit,
      pack.totalLimit,
    ]),
    [
      ["small", 10, 200, null, null],
      ["medium", 50, 500, 2, 20],
      ["large", 100, 1000, 1, 10],
    ],
  );

  const custom = sanitizeCouponPackConfig({
    medium: { ratioPercent: 650.5, dailyLimit: 3, totalLimit: 0 },
  });
  assert.deepEqual(custom.medium, { ratioPercent: 650.5, dailyLimit: 3, totalLimit: 0 });
  assert.deepEqual(custom.small, DEFAULT_COUPON_PACK_CONFIG.small);
  assert.equal(
    sanitizeCouponPackConfig({ large: { ratioPercent: 9e9 } }).large.ratioPercent,
    100_000,
  );
  assert.equal(
    sanitizeCouponPackConfig({ large: { ratioPercent: -5 } }).large.ratioPercent,
    1000,
  );

  const packs = buildCouponPacks(custom);
  assert.equal(packs[1].dailyLimit, 3);
  assert.equal(packs[1].totalLimit, null);
});

test("珍宝礼包：每份另赠 1 张券，按活动单价折算后与倍率券面一起到账", () => {
  const [small, medium, large] = buildCouponPacks(DEFAULT_COUPON_PACK_CONFIG);
  assert.deepEqual(packGrant(small, 1), {
    baseCredits: 20,
    bonusTickets: 1,
    bonusCredits: 1,
    totalCredits: 21,
  });
  assert.deepEqual(packGrant(medium, 25.5), {
    baseCredits: 250,
    bonusTickets: 1,
    bonusCredits: 25.5,
    totalCredits: 275.5,
  });
  assert.equal(packGrant(large, 3).totalCredits, 1003);
});

test("活动券单价：三种活动默认 1 cr / 张，脏值回落、超限封顶", () => {
  assert.equal(DEFAULT_LOTTERY_CONFIG.couponUnitCredits, 1);
  assert.equal(DEFAULT_FLIP_CONFIG.couponUnitCredits, 1);
  assert.equal(DEFAULT_RAIDEN_CONFIG.couponUnitCredits, 1);

  assert.equal(sanitizeLotteryConfig({ couponUnitCredits: 25.5 }).couponUnitCredits, 25.5);
  assert.equal(sanitizeFlipConfig({ couponUnitCredits: "abc" }).couponUnitCredits, 1);
  assert.equal(sanitizeFlipConfig({ couponUnitCredits: -5 }).couponUnitCredits, 1);
  assert.equal(sanitizeRaidenConfig({ couponUnitCredits: 9e9 }).couponUnitCredits, 1_000_000);
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
