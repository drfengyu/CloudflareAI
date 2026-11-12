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
  generateTrialQuestions,
  publicQuestions,
  scoreTrialAnswers,
} from "../lib/trial/questions";
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

test("试炼题目互不相同，交卷只按服务端答案判分", () => {
  const questions = generateTrialQuestions(10, seeded(7));
  assert.equal(questions.length, 10);
  assert.equal(new Set(questions.map((question) => question.prompt)).size, 10);
  for (const question of questions) {
    assert.ok(Number.isInteger(question.answer));
    assert.ok(question.answer >= 0 && question.answer <= 999);
  }

  assert.equal(scoreTrialAnswers(questions, questions.map((question) => question.answer)), 10);
  // 字符串数字可以，小数只取整，非数字算错。
  assert.equal(scoreTrialAnswers(questions, questions.map((question) => String(question.answer))), 10);
  assert.equal(scoreTrialAnswers(questions, questions.map((question) => question.answer + 0.9)), 10);
  assert.equal(scoreTrialAnswers(questions, questions.map(() => "abc")), 0);
  assert.equal(scoreTrialAnswers(questions, []), 0);

  const exposed = publicQuestions(questions) as { prompt: string; answer?: number }[];
  assert.equal(exposed.length, 10);
  for (const item of exposed) {
    assert.equal(item.answer, undefined);
    assert.equal(typeof item.prompt, "string");
  }
});

test("试炼配置：题数与档位互相约束，脏值退回可用默认", () => {
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

  assert.equal(config.questionCount, 10);
  assert.equal(config.timeLimitSeconds, 15);
  assert.equal(config.dailyRuns, 1);
  assert.equal(config.rewardValidDays, 1);
  // 票价按券单价对齐整张：7 → 5。
  assert.equal(config.runPriceCredits, 5);
  // 重复档位保留第一条，超出题数的被丢弃，奖励不为负。
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

  // 默认 5 题 / 120 秒：最短 20 秒（每题 4 秒），最长 125 秒。
  assert.deepEqual(trialTimeBounds(config), { minMs: 20_000, maxMs: 125_000 });
  // 题多到超过限时也不会让最短时间超过限时。
  assert.deepEqual(trialTimeBounds(trial({ questionCount: 10, timeLimitSeconds: 60 })), {
    minMs: 40_000,
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
