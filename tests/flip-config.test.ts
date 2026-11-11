import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_FLIP_CONFIG,
  FLIP_CARD_COUNT,
  dealFlipBoard,
  flipActivityWindow,
  flipExpectation,
  flipRewardTickets,
  parseFlipBoard,
  sanitizeFlipConfig,
  type FlipConfig,
} from "../lib/flip/config";

function config(overrides: Partial<FlipConfig> = {}): FlipConfig {
  return { ...DEFAULT_FLIP_CONFIG, ...overrides };
}

/**
 * 翻牌夺宝的赔率是「算出来的」而不是「跑出来的」：牌桌就 FLIP_CARD_COUNT 格，
 * 每局从完整一副牌里翻一张，所以期望恒等于合计 ÷ 张数。这里守住这个等式，
 * 顺带盯住洗牌只换位置不换奖项、脏配置退回可用值。
 */
test("默认牌桌的期望与返还率是精确值", () => {
  const e = flipExpectation(DEFAULT_FLIP_CONFIG);
  assert.equal(e.boardTotal, 720);
  assert.equal(e.expectedPerRound, 60);
  assert.equal(e.returnRatePercent, 60);
  assert.equal(e.houseEdge, 40);
  assert.equal(e.winningCards, 6);
  assert.equal(e.hitChancePercent, 50);
});

test("票价与牌桌联动的返还率", () => {
  // 同样一副牌，票价翻倍就把返还率砍一半——票价是独立的利润率杠杆。
  assert.equal(flipExpectation(config({ roundPriceCredits: 200 })).returnRatePercent, 30);
  assert.equal(
    flipExpectation(config({ cardRewards: [720, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] })).expectedPerRound,
    60,
  );
});

test("券奖判定：只有券单价的整数倍才发整张", () => {
  assert.equal(flipRewardTickets(2000, 1000), 2);
  assert.equal(flipRewardTickets(1000, 1000), 1);
  assert.equal(flipRewardTickets(800, 1000), null);
  assert.equal(flipRewardTickets(2500, 1000), null);
  assert.equal(flipRewardTickets(0, 1000), null);
  assert.equal(flipRewardTickets(1000, 0), null);
});

test("洗牌保集合，且首张确实会变", () => {
  const sorted = (board: number[]) => [...board].sort((a, b) => a - b).join(",");
  const base = sorted(DEFAULT_FLIP_CONFIG.cardRewards);
  const firstCards = new Set<number>();
  for (let i = 0; i < 5_000; i += 1) {
    const board = dealFlipBoard(DEFAULT_FLIP_CONFIG);
    assert.equal(board.length, FLIP_CARD_COUNT);
    assert.equal(sorted(board), base);
    firstCards.add(board[0]);
  }
  assert.ok(firstCards.size > 1, "洗牌后第一张应当不恒定");
});

test("随机挑一张的实测均值贴着期望", () => {
  let total = 0;
  const trials = 50_000;
  for (let i = 0; i < trials; i += 1) {
    const board = dealFlipBoard(DEFAULT_FLIP_CONFIG);
    total += board[Math.floor(Math.random() * FLIP_CARD_COUNT)];
  }
  assert.ok(Math.abs(total / trials - 60) < 1, `均值 ${total / trials} 应贴着 60`);
});

test("脏配置退回可用值，不抛异常", () => {
  for (const raw of [null, undefined, {}, [], "x", 42]) {
    const c = sanitizeFlipConfig(raw);
    assert.equal(c.enabled, false);
    assert.equal(c.cardRewards.length, FLIP_CARD_COUNT);
    assert.equal(c.roundPriceCredits, DEFAULT_FLIP_CONFIG.roundPriceCredits);
  }

  // 票价只接受正数：负数与 NaN 都退回默认价，避免「负票价」变成倒贴。
  assert.equal(sanitizeFlipConfig({ roundPriceCredits: -5 }).roundPriceCredits, 100);
  assert.equal(sanitizeFlipConfig({ roundPriceCredits: "abc" }).roundPriceCredits, 100);

  // 牌桌长短都补/裁到 12 格，越界金额夹到 [0, 上限]。
  assert.equal(sanitizeFlipConfig({ cardRewards: [100] }).cardRewards[0], 100);
  assert.equal(sanitizeFlipConfig({ cardRewards: [100] }).cardRewards.length, FLIP_CARD_COUNT);
  assert.equal(sanitizeFlipConfig({ cardRewards: [-9] }).cardRewards[0], 0);
  assert.equal(sanitizeFlipConfig({ cardRewards: [9e9] }).cardRewards[0], 1_000_000);
  assert.equal(sanitizeFlipConfig({ cardRewards: [1.2345] }).cardRewards[0], 1.23);

  // 有效期与每日上限夹在边界上（不是悄悄回默认值），管理员填 0 就是想要最小值。
  const clamped = sanitizeFlipConfig({ rewardValidDays: 0, dailyRounds: 0 });
  assert.equal(clamped.rewardValidDays, 1);
  assert.equal(clamped.dailyRounds, 1);
});

test("坏牌桌行不会卡死结算", () => {
  for (const raw of [null, undefined, "", "{not json", "[]", "[300,180]"]) {
    const board = parseFlipBoard(raw);
    assert.equal(board.length, FLIP_CARD_COUNT);
    assert.equal(board[0], raw === "[300,180]" ? 300 : 0);
  }
});

test("活动窗口四态", () => {
  const now = Date.parse("2026-11-02T12:00:00+08:00");
  assert.equal(flipActivityWindow(config({ enabled: false }), now).status, "disabled");
  assert.equal(flipActivityWindow(config({ enabled: true, startAt: "", endAt: "" }), now).status, "pending");
  assert.equal(
    flipActivityWindow(config({ enabled: true, startAt: "2026-11-01 00:00", endAt: "2026-11-03 00:00" }), now).status,
    "active",
  );
  assert.equal(
    flipActivityWindow(config({ enabled: true, startAt: "2026-10-01 00:00", endAt: "2026-10-31 00:00" }), now).status,
    "ended",
  );
  // 时间倒着填算「尚未开始」，而不是让整个活动页崩掉。
  assert.equal(
    flipActivityWindow(config({ enabled: true, startAt: "2026-11-03 00:00", endAt: "2026-11-01 00:00" }), now).status,
    "pending",
  );
});
