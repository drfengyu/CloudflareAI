import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_TRIAL_CONFIG,
  TRIAL_MAX_FLOORS,
  sanitizeTrialConfig,
  trialRewardFor,
  type TrialConfig,
} from "../lib/trial/config";
import { SAGA_CHAPTERS } from "../lib/trial/saga/data";
import {
  SAGA_RUN_VERSION,
  type SagaCommand,
  type SagaRun,
} from "../lib/trial/saga/types";
import {
  autoPlaySagaRun,
  generateSagaRun,
  parseSagaRun,
  replaySagaRun,
  sanitizeSagaCommands,
  settleSagaRun,
} from "../lib/trial/saga/run";
import { initialTrialSave } from "../lib/trial/saga/state";

function trial(overrides: Partial<TrialConfig> = {}): TrialConfig {
  return { ...DEFAULT_TRIAL_CONFIG, ...overrides };
}

function freshRun(seed = 11, nodeCount = 5): SagaRun {
  return generateSagaRun({
    activityKey: "trial-test",
    save: initialTrialSave(),
    nodeCount,
    seed,
  });
}

/** 一场必定能打赢的测试关：敌军只有 1 点兵力，用来验证结算与章节推进。 */
function easyRun(startSave = initialTrialSave()): SagaRun {
  return {
    version: SAGA_RUN_VERSION,
    kind: "saga",
    activityKey: "trial-test",
    seed: 1,
    nodes: [
      {
        kind: "boss",
        name: "测试关",
        blurb: "",
        chapter: startSave.chapter,
        enemies: [
          {
            id: "zhangjiao",
            name: "张角",
            title: "测试",
            level: 1,
            troops: 1,
            maxTroops: 1,
            force: 0,
            intellect: 0,
            defense: 0,
            speed: 0,
            tactics: [],
            color: "#000000",
            accent: "#ffffff",
            recruitable: false,
            recruitHard: false,
            boss: true,
          },
        ],
        rewardGold: 30,
        rewardExp: 40,
        enemyFormation: "yulin",
      },
    ],
    startSave,
    purchases: [],
    shopSeq: 0,
  };
}

const winCommands: SagaCommand[] = [
  {
    k: "battle",
    rounds: Array.from({ length: 5 }, () => [
      { g: "liubei", a: "attack", target: 0 },
      { g: "guanyu", a: "attack", target: 0 },
      { g: "zhangfei", a: "attack", target: 0 },
    ]),
  },
];

// ---------------------------------------------------------------- 每日试炼

test("讨逆传生成：同种子同一局，节点按章节地名推进并以首领收尾", () => {
  const run = freshRun();
  assert.equal(run.version, SAGA_RUN_VERSION);
  assert.equal(run.kind, "saga");
  assert.equal(run.nodes.length, 5);
  assert.deepEqual(
    run.nodes.map((node) => node.kind),
    ["battle", "battle", "battle", "elite", "boss"],
  );
  assert.deepEqual(freshRun(), run);
  assert.equal(freshRun(12).seed, 12);

  const stages = new Set(SAGA_CHAPTERS[0].stages);
  for (const node of run.nodes) {
    assert.equal(stages.has(node.name.split("·")[0]), true, `节点地名 ${node.name} 来自章节`);
    const ids = node.enemies.map((enemy) => enemy.id);
    assert.equal(new Set(ids).size, ids.length, "同一场敌将不重复");
  }
  assert.equal(run.nodes[run.nodes.length - 1].enemies[0].id, SAGA_CHAPTERS[0].boss);

  assert.equal(freshRun(5, TRIAL_MAX_FLOORS).nodes.length, TRIAL_MAX_FLOORS);
  assert.equal(freshRun(5, 0).nodes.length, 2);
});

test("对局 JSON：版本校验严格，旧玩法与损坏数据一律当没有对局", () => {
  const run = freshRun();
  const parsed = parseSagaRun(JSON.stringify(run));
  assert.ok(parsed);
  assert.deepEqual(parsed.nodes, run.nodes);
  assert.deepEqual(parsed.startSave, run.startSave);
  assert.equal(parsed.seed, run.seed);
  assert.equal(parsed.endSave, undefined);
  assert.equal(parseSagaRun(null), null);
  assert.equal(parseSagaRun("[]"), null);
  assert.equal(parseSagaRun("not-json"), null);
  assert.equal(parseSagaRun(JSON.stringify({ ...run, version: 5 })), null);
  assert.equal(parseSagaRun(JSON.stringify({ ...run, kind: "dungeon" })), null);
  assert.equal(parseSagaRun(JSON.stringify({ ...run, activityKey: "" })), null);
  assert.equal(parseSagaRun(JSON.stringify({ ...run, nodes: [] })), null);
  assert.equal(parseSagaRun(JSON.stringify({ ...run, nodes: Array(8).fill(run.nodes[0]) })), null);
  // v5 浮游城/答题存档不会被误认成讨逆传。
  assert.equal(parseSagaRun(JSON.stringify({ version: 5, seed: 1, heroHp: 100, floors: [] })), null);
});

test("指令清洗：未知字段、军需商店与错槽装备都被丢弃", () => {
  const commands = sanitizeSagaCommands([
    { k: "formation", f: "fengshi" },
    { k: "formation", f: "bogus" },
    { k: "shop", i: "herb" },
    { k: "shop", i: "secret_medicine" },
    { k: "equip", g: "liubei", slot: "weapon", i: "guandao" },
    { k: "equip", g: "liubei", slot: "weapon", i: "cloth" },
    { k: "party", active: ["liubei", "guanyu", "zhangfei"] },
    {
      k: "battle",
      rounds: [
        [
          { g: "liubei", a: "attack", target: 0 },
          { g: "guanyu", a: "cast", target: 0 },
          { g: "zhangfei", a: "tactic", t: "guwu" },
        ],
      ],
    },
    { k: "leave" },
    "junk",
    null,
  ]);
  assert.deepEqual(
    commands.map((command) => command.k),
    ["formation", "shop", "equip", "party", "battle", "leave"],
  );
  const battle = commands[4];
  assert.equal(battle.k, "battle");
  if (battle.k === "battle") {
    assert.equal(battle.rounds.length, 1);
    assert.deepEqual(
      battle.rounds[0].map((round) => round.a),
      ["attack", "tactic"],
    );
  }
  assert.deepEqual(sanitizeSagaCommands("nope"), []);
});

test("指令重放是纯函数；战斗没打完会锁住本局，不能反复重开", () => {
  const run = freshRun(21, 3);
  assert.equal(replaySagaRun(run, []).state.nodeIndex, 0);

  const commands: SagaCommand[] = [
    { k: "formation", f: "fengshi" },
    { k: "shop", i: "herb" },
    { k: "battle", rounds: [] },
  ];
  const first = replaySagaRun(run, commands);
  assert.equal(first.state.scene, "battle");
  assert.deepEqual(replaySagaRun(run, commands), first);

  const withLeave = replaySagaRun(run, [...commands, { k: "leave" }]);
  assert.equal(withLeave.state.scene, "battle");
  assert.equal(withLeave.cleared, 0);
});

test("军需购买从 cmdIndex 起生效，不会回溯加强已经开打的战斗", () => {
  const run = freshRun(31, 2);
  const purchased = (cmdIndex: number): SagaRun => ({
    ...run,
    purchases: [{ id: "buy1", itemId: "tiger_tally", tickets: 2, at: 1, cmdIndex }],
  });
  const battle: SagaCommand = { k: "battle", rounds: [] };
  const troops = (state: ReturnType<typeof replaySagaRun>): number => {
    const current = state.state.battle;
    assert.ok(current);
    return current.party.reduce((sum, general) => sum + general.maxTroops, 0);
  };

  const baseline = troops(replaySagaRun(run, [battle]));
  const applied = troops(replaySagaRun(purchased(0), [battle]));
  const late = troops(replaySagaRun(purchased(1), [battle, { k: "leave" }]));
  assert.ok(applied > baseline, "开战前买虎符，全队兵力上限提高");
  assert.equal(late, baseline, "打完第一场再买，本场不会被加强");
});

test("攻克章节：发金币经验、进下一章并解锁武将写进存档", () => {
  const startSave = initialTrialSave();
  startSave.chapter = 2;
  const settled = settleSagaRun(easyRun(startSave), winCommands);

  assert.equal(settled.cleared, 1);
  assert.equal(settled.victory, true);
  assert.equal(settled.result.chapterName, "徐州风云");
  assert.equal(settled.result.chapterAfter, 3);
  assert.equal(settled.endSave.chapter, 3);
  assert.equal(settled.endSave.stats.wins, 1);
  assert.equal(settled.endSave.stats.runs, 1);
  assert.ok(settled.endSave.gold > startSave.gold);
  assert.equal(
    [...settled.endSave.party, ...settled.endSave.reserve].some((member) => member.id === "zhaoyun"),
    true,
    "通关徐州风云后赵云入队",
  );
  assert.deepEqual(settled.result.recruited, []);
});

test("自动战斗完整跑一局：重复调用结果一致，战绩按局累计", () => {
  const run = freshRun(41, 3);
  const first = autoPlaySagaRun(run);
  const second = autoPlaySagaRun(run);
  assert.deepEqual(second, first);
  assert.equal(first.result.total, 3);
  assert.equal(first.endSave.stats.runs, 1);
  assert.ok(first.state.nodeIndex >= 0 && first.state.nodeIndex <= 3);
  assert.ok(first.cleared >= 0 && first.cleared <= 3);
});

test("讨逆配置：节点数与档位互相约束，脏值退回可用默认", () => {
  const config = sanitizeTrialConfig({
    questionCount: 99,
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

  assert.equal(config.questionCount, TRIAL_MAX_FLOORS);
  assert.equal(config.rewardValidDays, 1);
  // 票价按券单价对齐整张：7 → 5。
  assert.equal(config.runPriceCredits, 5);
  // 重复档位保留第一条，超出节点数的被丢弃，奖励不为负。
  assert.deepEqual(config.tiers, [
    { correct: 1, reward: 0 },
    { correct: 3, reward: 2 },
  ]);
  const fallback = sanitizeTrialConfig(null);
  assert.equal(fallback.questionCount, DEFAULT_TRIAL_CONFIG.questionCount);
  assert.equal(sanitizeTrialConfig({ questionCount: 1 }).questionCount, 2);
});

test("平定奖励取攻克节点数的最高一档", () => {
  const config = trial();
  assert.equal(trialRewardFor(config, 0), 0);
  assert.equal(trialRewardFor(config, 1), 0);
  assert.equal(trialRewardFor(config, 2), 1);
  assert.equal(trialRewardFor(config, 4), 4);
  assert.equal(trialRewardFor(config, 5), 8);
  assert.equal(trialRewardFor(config, 99), 8);
});

test("平定最后一处地方：剧情停在终点，不越界到不存在的下一处", () => {
  const startSave = initialTrialSave();
  startSave.chapter = SAGA_CHAPTERS.length - 1;
  const settled = settleSagaRun(easyRun(startSave), winCommands);

  assert.equal(settled.victory, true);
  assert.equal(settled.result.chapterAfter, SAGA_CHAPTERS.length - 1);
  assert.equal(settled.endSave.chapter, SAGA_CHAPTERS.length - 1);
  assert.equal(settled.endSave.stats.wins, 1);
});
