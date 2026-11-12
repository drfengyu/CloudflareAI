import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_TRIAL_CONFIG,
  sanitizeTrialConfig,
  trialRewardFor,
  trialTimeBounds,
  type TrialConfig,
} from "../lib/trial/config";
import {
  generateTrialDungeon,
  parseTrialDungeon,
  simulateTrialDungeon,
  type TrialDungeon,
  type TrialWave,
} from "../lib/trial/dungeon";
import {
  DEFAULT_WORKSHOP_CONFIG,
  WORKSHOP_LINES,
  gatherWeightSummary,
  rollGatherTier,
  sanitizeWorkshopConfig,
  sanitizeWorkshopMilestones,
  workshopTierName,
} from "../lib/workshop/config";
import {
  COLLECTION_SETS,
  collectionItemKey,
  completedSets,
  isSetComplete,
  missingItems,
  rollCollectionItem,
  sanitizeCollectionConfig,
  sanitizeCollectionSetRewards,
} from "../lib/collection/config";

/** 固定种子的 LCG：同一个种子每次跑出同一串随机数，便于断言边界。 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(values.length - 1, index++)];
}

function trial(overrides: Partial<TrialConfig> = {}): TrialConfig {
  return { ...DEFAULT_TRIAL_CONFIG, ...overrides };
}

// ---------------------------------------------------------------- 每日试炼

const dummyWave = (overrides: Partial<TrialWave> = {}): TrialWave => ({
  key: "dummy",
  name: "木桩",
  title: "测试用",
  shape: "mire",
  hp: 1,
  atk: 5,
  pattern: ["attack"],
  ...overrides,
});

const dummyBoss = (wave: Partial<TrialWave> = {}): TrialDungeon["floors"][number]["boss"] => ({
  kind: "fight",
  title: "层主房",
  hint: "",
  wave: dummyWave(wave),
});

function manualDungeon(floors: TrialDungeon["floors"]): TrialDungeon {
  return { version: 4, seed: 1, heroHp: 100, floors };
}

test("浮游城生成：每层两个野区门与一间层主房，同种子重放同一张塔", () => {
  const dungeon = generateTrialDungeon(5, seeded(11));
  assert.equal(dungeon.floors.length, 5);
  for (const floor of dungeon.floors) {
    assert.equal(floor.rooms.length, 2);
    assert.ok(floor.rooms.some((room) => room.kind === "fight" || room.kind === "elite"));
    assert.ok(floor.boss.wave);
    assert.equal(floor.boss.wave?.enrage, true);
    for (const room of floor.rooms) {
      if (room.kind === "treasure" || room.kind === "elite") assert.ok(room.relic);
      if (room.kind !== "treasure" && room.kind !== "rest") assert.ok(room.wave);
    }
  }
  assert.deepEqual(generateTrialDungeon(5, seeded(11)), dungeon);
  assert.equal(generateTrialDungeon(99, seeded(2)).floors.length, 7);
  assert.equal(generateTrialDungeon(0, seeded(2)).floors.length, 1);
});

test("旧版答题 / 单排波次 / 旧地下城对局不胜任浮游城", () => {
  assert.equal(parseTrialDungeon(null), null);
  assert.equal(parseTrialDungeon(JSON.stringify([{ prompt: "1+1", answer: 2 }])), null);
  assert.equal(parseTrialDungeon(JSON.stringify({ version: 2, seed: 1, heroHp: 80, waves: [] })), null);
  assert.equal(
    parseTrialDungeon(
      JSON.stringify({ version: 3, seed: 1, heroHp: 100, floors: [{ rooms: [] }] }),
    ),
    null,
  );

  const generated = generateTrialDungeon(3, seeded(5));
  assert.deepEqual(parseTrialDungeon(JSON.stringify(generated)), generated);
});

test("宝箱立即给装备，层主经验会升级并抬升生命上限", () => {
  const dungeon = manualDungeon([
    {
      rooms: [
        { kind: "treasure", title: "宝箱", hint: "", relic: "bloodpact" },
        { kind: "rest", title: "营地", hint: "" },
      ],
      boss: dummyBoss(),
    },
    {
      rooms: [
        { kind: "treasure", title: "宝箱", hint: "", relic: "whetstone" },
        { kind: "rest", title: "营地", hint: "" },
      ],
      boss: dummyBoss(),
    },
  ]);

  const result = simulateTrialDungeon(dungeon, [
    { t: "enter", i: 0 },
    { t: "boss" },
    { t: "skill", s: "slash" },
    { t: "boss" },
    { t: "skill", s: "slash" },
  ]);
  assert.deepEqual(result.relics, ["bloodpact"]);
  // 生命结晶 115，击败 1F 层主（45 EXP）升到 2 级再加 10。
  assert.equal(result.heroMaxHp, 125);
  assert.equal(result.heroHp, 125);
  assert.equal(result.level, 2);
  assert.equal(result.floorsCleared, 2);
  assert.equal(result.status, "cleared");
  assert.equal(result.victory, true);
  assert.equal(result.events[0].relic, "bloodpact");
  assert.equal(result.events[1].kind, "boss");
});

test("精英装备在击破后才生效，营地按上限回血，可以直接挑战层主", () => {
  const dungeon = manualDungeon([
    {
      rooms: [
        {
          kind: "elite",
          title: "精英木桩",
          hint: "",
          relic: "whetstone",
          wave: dummyWave({ hp: 1, atk: 30, pattern: ["attack"] }),
        },
        { kind: "rest", title: "营地", hint: "" },
      ],
      boss: dummyBoss(),
    },
    {
      rooms: [{ kind: "rest", title: "营地", hint: "" }],
      boss: dummyBoss(),
    },
  ]);

  const entered = simulateTrialDungeon(dungeon, [{ t: "enter", i: 0 }]);
  assert.deepEqual(entered.relics, []);
  assert.equal(entered.status, "fighting");

  const afterFight = simulateTrialDungeon(dungeon, [
    { t: "enter", i: 0 },
    { t: "skill", s: "guard" },
    { t: "skill", s: "slash" },
  ]);
  assert.deepEqual(afterFight.relics, ["whetstone"]);
  assert.equal(afterFight.status, "choosing");
  assert.equal(afterFight.fieldCleared, true);
  // 守势格挡 14，吃 16 伤害 → 84；清怪回复 6 → 90。
  assert.equal(afterFight.heroHp, 90);

  const rested = simulateTrialDungeon(dungeon, [
    { t: "enter", i: 0 },
    { t: "skill", s: "guard" },
    { t: "skill", s: "slash" },
    { t: "boss" },
    { t: "skill", s: "slash" },
    { t: "enter", i: 0 },
  ]);
  // 层主经验升到 2 级（上限 110，清怪与升级共回 16 → 106），营地补到满。
  assert.equal(rested.heroMaxHp, 110);
  assert.equal(rested.heroHp, rested.heroMaxHp);
  assert.equal(rested.events[2].healed, 4);

  const skipped = simulateTrialDungeon(dungeon, [{ t: "boss" }]);
  assert.equal(skipped.status, "fighting");
  assert.equal(skipped.current?.boss, true);
});

test("同一动作序列可重复重放；非法动作兜底为第一扇门 / 斩击", () => {
  const dungeon = manualDungeon([
    {
      rooms: [{ kind: "fight", title: "木桩", hint: "", wave: dummyWave({ hp: 400, atk: 5 }) }],
      boss: dummyBoss(),
    },
    {
      rooms: [{ kind: "fight", title: "木桩", hint: "", wave: dummyWave({ hp: 400, atk: 5 }) }],
      boss: dummyBoss(),
    },
  ]);
  const actions = [
    { t: "enter", i: 0 },
    ...Array.from({ length: 40 }, (_, i) => ({
      t: "skill",
      s: i % 5 === 0 ? "burst" : i % 3 === 0 ? "guard" : "slash",
    })),
    { t: "boss" },
    { t: "skill", s: "slash" },
  ];
  const first = simulateTrialDungeon(dungeon, actions);
  assert.deepEqual(simulateTrialDungeon(dungeon, actions), first);
  assert.ok(first.turns > 0);
  assert.equal(first.floorsCleared >= 1, true);

  const ignored = simulateTrialDungeon(dungeon, ["garbage", 1, null]);
  assert.equal(ignored.status, "choosing");
  assert.equal(ignored.turns, 0);

  const fallback = simulateTrialDungeon(dungeon, [{ t: "enter", i: 99 }]);
  assert.equal(fallback.events.length, 1);
  assert.equal(fallback.events[0].floor, 1);
});

test("试炼配置：层数与档位互相约束，脏值退回可用默认", () => {
  const config = sanitizeTrialConfig({
    questionCount: 99,
    timeLimitSeconds: 1,
    dailyRuns: 0,
    runPriceCredits: 7,
    couponUnitCredits: 5,
    rewardValidDays: 0,
    tiers: [
      { correct: 3, reward: 2 },
      { correct: 3, reward: 9 },
      { correct: 20, reward: 99 },
      { correct: 1, reward: -5 },
    ],
  });

  assert.equal(config.questionCount, 7);
  assert.equal(config.timeLimitSeconds, 15);
  assert.equal(config.dailyRuns, 1);
  assert.equal(config.rewardValidDays, 1);
  // 票价按券单价对齐整张：7 → 5。
  assert.equal(config.runPriceCredits, 5);
  // 重复档位保留第一条，超出层数的被丢弃，奖励不为负。
  assert.deepEqual(config.tiers, [
    { correct: 1, reward: 0 },
    { correct: 3, reward: 2 },
  ]);
  assert.equal(sanitizeTrialConfig(null).questionCount, DEFAULT_TRIAL_CONFIG.questionCount);
});

test("试炼奖励取达到的最高一档，时间边界守住瞬交与超时", () => {
  const config = trial();
  assert.equal(trialRewardFor(config, 0), 0);
  assert.equal(trialRewardFor(config, 1), 0);
  assert.equal(trialRewardFor(config, 2), 1);
  assert.equal(trialRewardFor(config, 4), 4);
  assert.equal(trialRewardFor(config, 5), 8);
  assert.equal(trialRewardFor(config, 99), 8);

  // 默认 5 层 / 300 秒：最短 8 秒（下限），最长 305 秒。
  assert.deepEqual(trialTimeBounds(config), { minMs: 8_000, maxMs: 305_000 });
  // 每层 1.5 秒，但不超过限时；60 秒限时 → 最短 15 秒。
  assert.deepEqual(trialTimeBounds(trial({ questionCount: 10, timeLimitSeconds: 60 })), {
    minMs: 15_000,
    maxMs: 65_000,
  });
});

// ---------------------------------------------------------------- 灵宠工坊

test("采集阶级按权重落档，全零权重退回 1 阶", () => {
  assert.equal(rollGatherTier([60, 30, 10], () => 0), 1);
  assert.equal(rollGatherTier([60, 30, 10], () => 0.59), 1);
  assert.equal(rollGatherTier([60, 30, 10], () => 0.6), 2);
  assert.equal(rollGatherTier([60, 30, 10], () => 0.999), 3);
  assert.equal(rollGatherTier([0, 0, 10], () => 0.01), 3);
  assert.equal(rollGatherTier([0, 0, 0], () => 0.5), 1);
  assert.equal(rollGatherTier([-1, -1, -1], () => 0.5), 1);
});

test("工坊里程碑去重并按阶升序，阶数越界被丢掉", () => {
  const rows = sanitizeWorkshopMilestones([
    { tier: 9, reward: 80 },
    { tier: 3, reward: 6 },
    { tier: 3, reward: 99 },
    { tier: 0, reward: 5 },
    { tier: 10, reward: 5 },
    { tier: 5.7, reward: 15 },
  ]);
  assert.deepEqual(rows, [
    { tier: 3, reward: 6 },
    { tier: 5, reward: 15 },
    { tier: 9, reward: 80 },
  ]);
});

test("工坊配置按券单价对齐票价，权重全零时退回默认", () => {
  const config = sanitizeWorkshopConfig({
    gatherCostCredits: 5,
    couponUnitCredits: 3,
    dailyGathers: 0,
    gatherWeights: [0, 0, 0],
    milestones: [],
  });
  // 5 / 3 → 2 张 → 6 cr。
  assert.equal(config.gatherCostCredits, 6);
  assert.equal(config.dailyGathers, 1);
  assert.deepEqual(config.gatherWeights, DEFAULT_WORKSHOP_CONFIG.gatherWeights);
  assert.deepEqual(config.milestones, DEFAULT_WORKSHOP_CONFIG.milestones);
  assert.equal(gatherWeightSummary(config), "60% / 30% / 10%");
});

test("工坊阶位名按线取，越界夹到两端", () => {
  assert.equal(workshopTierName("ember", 1), WORKSHOP_LINES[0].tiers[0]);
  assert.equal(workshopTierName("ember", 9), "九尾炎尊");
  assert.equal(workshopTierName("ember", 99), "九尾炎尊");
  assert.equal(workshopTierName("unknown", 0), WORKSHOP_LINES[0].tiers[0]);
});

// ---------------------------------------------------------------- 星匣图鉴

test("开匣先等概率选星匣再按权重抽藏品", () => {
  assert.deepEqual(rollCollectionItem(sequence([0, 0])), {
    setKey: COLLECTION_SETS[0].key,
    itemKey: COLLECTION_SETS[0].items[0].key,
  });
  assert.deepEqual(rollCollectionItem(sequence([0.99, 0])), {
    setKey: COLLECTION_SETS[COLLECTION_SETS.length - 1].key,
    itemKey: COLLECTION_SETS[COLLECTION_SETS.length - 1].items[0].key,
  });
  // 星匣内最后一个位置是 15 权重的王冠，随机数接近 1 时落在它上面。
  assert.deepEqual(rollCollectionItem(sequence([0, 0.999999])), {
    setKey: COLLECTION_SETS[0].key,
    itemKey: "crown",
  });
  assert.equal(COLLECTION_SETS.every((set) => set.items.length === 6), true);
});

test("集齐判定、缺件列表与集齐奖励补全", () => {
  const aurora = COLLECTION_SETS[0];
  const owned = new Set(
    aurora.items.slice(0, 5).map((item) => collectionItemKey(aurora.key, item.key)),
  );

  assert.equal(isSetComplete(owned, aurora.key), false);
  assert.deepEqual(completedSets(owned), []);
  assert.deepEqual(
    missingItems(owned, aurora.key).map((item) => item.key),
    [aurora.items[5].key],
  );

  owned.add(collectionItemKey(aurora.key, aurora.items[5].key));
  assert.equal(isSetComplete(owned, aurora.key), true);
  assert.deepEqual(completedSets(owned), [aurora.key]);
  assert.deepEqual(missingItems(owned, aurora.key), []);
});

test("图鉴集齐奖励按固定星匣顺序补齐，未知星匣被忽略", () => {
  assert.deepEqual(sanitizeCollectionSetRewards([{ set: "abyss", reward: 20 }, { set: "ghost", reward: 99 }]), [
    { set: "aurora", reward: 8 },
    { set: "abyss", reward: 20 },
    { set: "grove", reward: 30 },
  ]);
  // 重复行只认第一条。
  assert.deepEqual(
    sanitizeCollectionSetRewards([
      { set: "grove", reward: 40 },
      { set: "grove", reward: 80 },
    ]).find((row) => row.set === "grove"),
    { set: "grove", reward: 40 },
  );
});

test("图鉴配置对齐票价并夹住边界值", () => {
  const config = sanitizeCollectionConfig({
    openCostCredits: 5,
    couponUnitCredits: 2,
    dailyBoxes: 0,
    duplicateDust: -3,
    dustPerItem: 0,
    rewardValidDays: 0,
  });
  // 5 / 2 → 2.5 四舍五入为 3 张 → 6 cr。
  assert.equal(config.openCostCredits, 6);
  assert.equal(config.dailyBoxes, 1);
  assert.equal(config.duplicateDust, 0);
  assert.equal(config.dustPerItem, 1);
  assert.equal(config.rewardValidDays, 1);
  assert.equal(config.setRewards.length, COLLECTION_SETS.length);
});
