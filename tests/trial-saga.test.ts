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
  canEngageNode,
  generateSagaRun,
  openNodes,
  parseSagaRun,
  replaySagaRun,
  sanitizeSagaCommands,
  settleSagaRun,
} from "../lib/trial/saga/run";
import {
  fieldHotspotNear,
  fieldHitsSolid,
  fieldReachable,
  generateSagaField,
  sagaFieldFor,
} from "../lib/trial/saga/map";
import {
  SAGA_BANK_MAX_GOLD_PER_RUN,
  bankCreditsForGold,
} from "../lib/trial/saga/bank";
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
    node: 0,
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
    { k: "bank", g: 100 },
    { k: "bank", g: 150 },
    { k: "bank", g: 400 },
    { k: "bank", g: -100 },
    {
      k: "battle",
      node: 1,
      rounds: [
        [
          { g: "liubei", a: "attack", target: 0 },
          { g: "guanyu", a: "cast", target: 0 },
          { g: "zhangfei", a: "tactic", t: "guwu" },
        ],
      ],
    },
    { k: "leave" },
    // 营地下标越界、缺失或不是数字：整条战斗指令丢弃。
    { k: "battle", node: 7, rounds: [[]] },
    { k: "battle", node: -1, rounds: [[]] },
    { k: "battle", rounds: [[]] },
    "junk",
    null,
  ]);
  assert.deepEqual(
    commands.map((command) => command.k),
    ["formation", "shop", "equip", "party", "bank", "battle", "leave"],
  );
  const battle = commands.find((command) => command.k === "battle");
  assert.ok(battle && battle.k === "battle");
  if (battle.k === "battle") {
    assert.equal(battle.node, 1);
    assert.equal(battle.rounds.length, 1);
    assert.deepEqual(
      battle.rounds[0].map((round) => round.a),
      ["attack", "tactic"],
    );
  }
  assert.deepEqual(sanitizeSagaCommands("nope"), []);
});

test("指令重放是纯函数；战斗没打完会锁住本场，不能反复重开", () => {
  const run = freshRun(21, 3);
  const idle = replaySagaRun(run, []);
  assert.equal(idle.state.scene, "field");
  assert.deepEqual(idle.state.clearedNodes, []);
  assert.equal(idle.cleared, 0);

  const commands: SagaCommand[] = [
    { k: "formation", f: "fengshi" },
    { k: "shop", i: "herb" },
    { k: "battle", node: 0, rounds: [] },
  ];
  const first = replaySagaRun(run, commands);
  assert.equal(first.state.scene, "battle");
  assert.equal(first.state.battle?.nodeName, run.nodes[0].name);
  assert.deepEqual(replaySagaRun(run, commands), first);

  const withLeave = replaySagaRun(run, [...commands, { k: "leave" }]);
  assert.equal(withLeave.state.scene, "battle");
  assert.equal(withLeave.cleared, 0);
});

test("攻打顺序由大地图走位决定：首领本阵要先拔尽其余营寨", () => {
  const run = freshRun(71, 3);
  assert.deepEqual(
    run.nodes.map((node) => node.kind),
    ["battle", "elite", "boss"],
  );
  const state = replaySagaRun(run, []).state;
  assert.deepEqual(openNodes(run, state), [0, 1]);
  assert.equal(canEngageNode(run, state, 2), false, "其余营寨未破，打不了主帅本阵");
  assert.equal(canEngageNode(run, state, run.nodes.length), false);
  assert.equal(canEngageNode(run, state, -1), false);

  // 非法的攻打指令被丢弃：一个营也没破，人还留在大地图上，之后也不会被补打。
  const illegal = replaySagaRun(run, [{ k: "battle", node: 2, rounds: [] }]);
  assert.deepEqual(illegal.state.clearedNodes, []);
  assert.equal(illegal.state.scene, "field");
  assert.equal(illegal.cleared, 0);

  // 拔掉前锋两营后，本阵成为唯一可攻的目标；已破的营不能反复打。
  const nearEnd = replaySagaRun(run, []).state;
  nearEnd.clearedNodes = [0, 1];
  assert.deepEqual(openNodes(run, nearEnd), [2]);
  assert.equal(canEngageNode(run, nearEnd, 0), false);
});

test("军需购买从 cmdIndex 起生效，不会回溯加强已经开打的战斗", () => {
  const run = freshRun(31, 2);
  const purchased = (cmdIndex: number): SagaRun => ({
    ...run,
    purchases: [{ id: "buy1", itemId: "tiger_tally", tickets: 2, at: 1, cmdIndex }],
  });
  const battle: SagaCommand = { k: "battle", node: 0, rounds: [] };
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

test("钱庄存金：100 金一档、每趟封顶 300 金，超出的指令不再扣金", () => {
  const startSave = initialTrialSave();
  startSave.gold = 500;
  const run = { ...freshRun(51, 3), startSave };

  const banked = replaySagaRun(run, [
    { k: "bank", g: 100 },
    { k: "bank", g: 200 },
    { k: "bank", g: 100 },
  ]).state;
  assert.equal(banked.save.gold, 200, "只扣前 300 金");
  assert.equal(banked.bankedGold, SAGA_BANK_MAX_GOLD_PER_RUN);

  const poorSave = initialTrialSave();
  poorSave.gold = 250;
  const poor = replaySagaRun({ ...run, startSave: poorSave }, [{ k: "bank", g: 300 }]).state;
  assert.equal(poor.save.gold, 250, "金币不足时整笔不扣");
  assert.equal(poor.bankedGold, 0);

  assert.equal(bankCreditsForGold(0), 0);
  assert.equal(bankCreditsForGold(100), 1);
  assert.equal(bankCreditsForGold(300), 3);
  assert.equal(bankCreditsForGold(1000), 3, "再多的金币也只按上限结算");
});

test("钱庄换金：金币包按档位从 cmdIndex 起入账，未知档位不加钱", () => {
  const run = freshRun(61, 2);
  const purchase = (itemId: string, cmdIndex = 0): SagaRun => ({
    ...run,
    purchases: [{ id: `p-${itemId}-${cmdIndex}`, itemId, tickets: 0, at: 1, cmdIndex }],
  });

  const before = replaySagaRun(run, [{ k: "leave" }]).state.save.gold;
  const pack = replaySagaRun(purchase("gold_200"), [{ k: "leave" }]).state.save.gold;
  const unknown = replaySagaRun(purchase("gold_999"), [{ k: "leave" }]).state.save.gold;
  assert.equal(pack, before + 200);
  assert.equal(unknown, before);

  // 购买记录挂在 cmdIndex 上：先执行编队，再在第二条指令前入账。
  const late = replaySagaRun(purchase("gold_50", 1), [
    { k: "formation", f: "yulin" },
    { k: "leave" },
  ]);
  assert.equal(late.state.save.gold, before + 50);
});

test("收兵战果记录存金与通关金币，两者互不覆盖", () => {
  const startSave = initialTrialSave();
  startSave.gold = 500;
  const settled = settleSagaRun(easyRun(startSave), [
    { k: "bank", g: 300 },
    ...winCommands,
  ]);

  assert.equal(settled.result.bankedGold, 300);
  assert.equal(settled.result.goldGained, 30, "钱庄存金不算战斗战利品");
  assert.equal(settled.endSave.gold, 230, "500 − 300 存金 + 30 战利品");
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
  assert.equal(first.state.clearedNodes.length, first.cleared);
  assert.ok(first.cleared >= 0 && first.cleared <= 3);
  assert.equal(new Set(first.state.clearedNodes).size, first.state.clearedNodes.length, "同一座营不会被重复攻克");
  assert.ok(first.state.clearedNodes.every((node) => node >= 0 && node < 3));
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

test("平定奖励取攻破营寨数的最高一档", () => {
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

// ---------------------------------------------------------------- 行军大地图

test("大地图生成：同种子同一张图，营寨数量与节点一一对应", () => {
  for (let chapter = 0; chapter < SAGA_CHAPTERS.length; chapter++) {
    for (let nodeCount = 2; nodeCount <= 7; nodeCount++) {
      const seed = chapter * 97 + nodeCount;
      const field = generateSagaField({ chapter, nodeCount, seed });
      assert.deepEqual(generateSagaField({ chapter, nodeCount, seed }), field, "按种子复现");
      assert.deepEqual(
        field.camps.map((camp) => camp.node),
        Array.from({ length: nodeCount }, (_, index) => index),
      );
      assert.equal(field.camps.every((camp) => camp.x === (camp.tx + 0.5) * field.tile), true);
      assert.equal(
        field.camps[nodeCount - 1].x >= field.camps[nodeCount - 2].x,
        true,
        "主帅本阵扎在最远处",
      );
    }
  }
});

test("大地图可行走：城门与每座营都在四连通可达区内", () => {
  for (let chapter = 0; chapter < SAGA_CHAPTERS.length; chapter++) {
    for (let nodeCount = 2; nodeCount <= 7; nodeCount++) {
      const label = `第 ${chapter} 章 ${nodeCount} 营`;
      const field = generateSagaField({ chapter, nodeCount, seed: chapter * 31 + nodeCount * 7 });
      const seen = fieldReachable(field);
      assert.equal(fieldHitsSolid(field, field.spawn.x, field.spawn.y), false, `${label}：出生点不在墙上`);
      for (const camp of field.camps) {
        const cell = Math.floor(camp.y / field.tile) * field.cols + Math.floor(camp.x / field.tile);
        assert.equal(seen[cell], true, `${label}：营地 ${camp.node} 可达`);
        const hotspot = fieldHotspotNear(field, camp.x, camp.y - 6);
        assert.equal(hotspot?.kind, "camp", `${label}：走到营前能触发交互`);
        assert.equal(hotspot?.camp?.node, camp.node);
      }
      const atGate = fieldHotspotNear(field, field.city.x, field.city.y - 6);
      assert.equal(atGate?.kind, "city", `${label}：城门口可回城`);
      assert.equal(fieldHotspotNear(field, field.spawn.x, field.spawn.y - 6)?.kind, "city");
    }
  }
});

test("大地图不入库存档：只由种子复现，与对局 JSON 里的节点数一致", () => {
  const run = freshRun(81, 4);
  const field = sagaFieldFor(run);
  assert.equal(field.camps.length, run.nodes.length);
  assert.deepEqual(sagaFieldFor(run), generateSagaField({ chapter: 0, nodeCount: 4, seed: run.seed }));
  // 只有种子/节点数参与地图，行军进度不会改变地形。
  const replayed = { ...run, nodes: run.nodes.slice(0, 3) };
  assert.equal(sagaFieldFor(replayed).camps.length, 3);
});
