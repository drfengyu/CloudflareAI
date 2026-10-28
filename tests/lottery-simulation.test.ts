import assert from "node:assert/strict";
import { test } from "node:test";
import { makeRng, parseArgs, simulate, table } from "../scripts/lottery-sim";
import { DEFAULT_LOTTERY_CONFIG, type LotteryConfig } from "../lib/lottery/prize-math";

function pool(overrides: Partial<LotteryConfig> = {}): LotteryConfig {
  return {
    ...DEFAULT_LOTTERY_CONFIG,
    ticketPriceCredits: 100,
    outerChancePercent: 0,
    innerPrizes: [{ credits: 50, weight: 1 }],
    outerPrizes: [],
    milestones: [],
    ...overrides,
  };
}

const creditsPrize = { kind: "credits" as const, multiplier: 1, tickets: 0, weight: 1 };
const batchPool = pool({
  outerChancePercent: 100,
  outerPrizes: [creditsPrize],
  multiplierBase: "batch",
});

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
}

test("seeded simulation does not repeat the old 10466-value cycle", () => {
  for (const seed of [20261010, 1, 20261028]) {
    const rng = makeRng(seed);
    const values = Array.from({ length: 30000 }, rng);
    assert.notDeepEqual(values.slice(15000, 15032), values.slice(25466, 25498));
    assert.deepEqual(values, Array.from({ length: 30000 }, makeRng(seed)));
    assert.ok(values.every((value) => value >= 0 && value < 1));
  }
});

test("seed zero is distinct from seed one", () => {
  assert.notDeepEqual(Array.from({ length: 32 }, makeRng(0)), Array.from({ length: 32 }, makeRng(1)));
});

test("fixed seed has no gross distribution bias", () => {
  const rng = makeRng(20261010);
  const bins = Array<number>(10).fill(0);
  for (let i = 0; i < 100000; i += 1) bins[Math.floor(rng() * 10)] += 1;
  for (const count of bins) assert.ok(count > 9500 && count < 10500);
});

test("fixed inner payout is net of purchase cost, without double counting", () => {
  const result = simulate(pool(), 2, 10, () => 0.5);
  near(result.effective, 50);
  near(result.housePerTicket, 50);
  near(result.medianNet, -500);
});

test("batch multiplier uses one ticket for single draws, not all purchased tickets", () => {
  near(simulate(batchPool, 1, 100, () => 0.5).effective, 100);
});

test("ten-draw strategy uses ten-ticket batches then single draws for the remainder", () => {
  const result = simulate(batchPool, 1, 11, () => 0.5, { batchSize: 10 });
  near(result.effective, (10100 / 1100) * 100);
});

test("ticket multiplier does not depend on batch size", () => {
  const config = { ...batchPool, multiplierBase: "ticket" as const };
  near(simulate(config, 1, 11, () => 0.5, { batchSize: 10 }).effective, 100);
});

test("fractional ticket prices round the batch base before multiplying prizes", () => {
  const config = {
    ...batchPool,
    ticketPriceCredits: 1.13,
    outerPrizes: [{ ...creditsPrize, multiplier: 0.05 }],
  };
  near(simulate(config, 2, 10, () => 0.5, { batchSize: 10 }).effective, (0.57 / 1.13) * 100);
});

test("pity probability is frozen for all ten draws, including after a win", () => {
  const config = pool({
    outerChancePercent: 10,
    innerPrizes: [{ credits: 0, weight: 1 }],
    outerPrizes: [creditsPrize],
  });
  near(simulate(config, 1, 20, () => 0.899, { batchSize: 10 }).effective, 0);
  near(simulate(config, 1, 30, () => 0.899, { batchSize: 10 }).effective, 100 / 3);
  near(simulate(config, 1, 20, () => 0.899).effective, 5);
});

test("pity only sees the most recent thirty draws", () => {
  const config = pool({
    outerChancePercent: 10,
    innerPrizes: [{ credits: 0, weight: 1 }],
    outerPrizes: [creditsPrize],
  });
  near(simulate(config, 1, 100, () => 0.78).effective, 0);
});

test("milestone tickets are granted once, after the batch crossing the threshold", () => {
  const config = { ...batchPool, milestones: [{ draws: 1, tickets: 1 }, { draws: 5, tickets: 9 }] };
  near(simulate(config, 1, 10, () => 0.5, { batchSize: 10 }).effective, 2000);
});

test("prize tickets are replayed after the batch and not also valued at face price", () => {
  const config = {
    ...batchPool,
    outerPrizes: [
      { kind: "tickets" as const, tickets: 10, multiplier: 0, weight: 1 },
      creditsPrize,
    ],
  };
  let calls = 0;
  const rng = () => ++calls === 2 ? 0.25 : 0.75;
  near(simulate(config, 1, 10, rng, { batchSize: 10 }).effective, 1900);
});

test("a long but finite ticket chain is not silently truncated", () => {
  const config = pool({
    outerChancePercent: 100,
    outerPrizes: [
      { kind: "tickets", tickets: 1, multiplier: 0, weight: 1 },
      creditsPrize,
    ],
  });
  let calls = 0;
  near(simulate(config, 1, 1, () => ++calls <= 100 ? 0.25 : 0.75).effective, 100);
});

test("unending ticket chains fail instead of reporting a false profit", () => {
  const config = pool({
    outerChancePercent: 100,
    outerPrizes: [{ kind: "tickets", tickets: 1, multiplier: 0, weight: 1 }],
  });
  assert.throws(() => simulate(config, 1, 1, () => 0.5), /上限.*剩余.*券/);
});

test("sampling error is calculated across sessions, not individual draws", () => {
  const config = pool({ innerPrizes: [{ credits: 0, weight: 1 }, { credits: 100, weight: 1 }] });
  let calls = 0;
  const result = simulate(config, 2, 2, () => ++calls <= 2 ? 0.25 : 0.75);
  near(result.effective, 50);
  near(result.effectiveStandardError!, 50);
  assert.equal(simulate(config, 1, 2, () => 0.5).effectiveStandardError, null);
});

test("CLI rejects invalid numeric values and missing arguments", () => {
  for (const args of [
    ["--sessions", "0"], ["--sessions", "1.5"], ["--sessions", "NaN"],
    ["--draws", "1,0"], ["--draws", "-1"], ["--draws", "1,"],
    ["--seed", "Infinity"], ["--seed", "4294967296"],
    ["--target", "NaN"], ["--soften", "-1"], ["--file"], ["--file", "--out"],
    ["--batch", "5"], ["--unknown"],
  ]) assert.throws(() => parseArgs(args), /参数|必须|需要/);
});

test("CLI separates purchase count from batch size", () => {
  assert.equal(parseArgs([]).batchSize, 1);
  const options = parseArgs(["--batch", "10", "--draws", "1,11,100", "--seed", "0"]);
  assert.equal(options.batchSize, 10);
  assert.deepEqual(options.draws, [1, 11, 100]);
  assert.equal(options.seed, 0);
});

test("each table row is reproducible regardless of scenario order", () => {
  const options = parseArgs(["--sessions", "100", "--draws", "1,10", "--batch", "10"]);
  const first = table("baseline", DEFAULT_LOTTERY_CONFIG, options);
  const reversed = table("what-if", DEFAULT_LOTTERY_CONFIG, { ...options, draws: [10, 1] });
  assert.deepEqual(first.slice(3), reversed.slice(3).reverse());
  assert.deepEqual(first, table("baseline", DEFAULT_LOTTERY_CONFIG, options));
});
