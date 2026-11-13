/**
 * 野外遭遇战：行军大地图上随机撞见的散兵、山贼与盗贼。
 *
 * 编成只由「行军种子 + 本次第几场遭遇」推出，客户端即时开战、服务端收兵重放都用
 * 同一份纯函数，随机多少队、有没有将领都不需要上传。每趟最多 SAGA_MAX_ENCOUNTERS 场，
 * 免得有人站在草地里原地刷金币；官道与城内外不遇敌，草地、树林才有概率。
 */

import {
  SAGA_CHAPTERS,
  SAGA_FORMATIONS,
  SAGA_GENERAL_BY_ID,
  tacticsFor,
  traitStats,
} from "./data";
import type { SagaEnemy, SagaNode, SagaRun } from "./types";

export const SAGA_MAX_ENCOUNTERS = 10;

interface FoeTemplate {
  key: "soldier" | "bandit" | "thief";
  name: string;
  title: string;
  group: string;
  blurb: string;
  force: number;
  intellect: number;
  defense: number;
  speed: number;
  baseTroops: number;
  growth: number;
  color: string;
  accent: string;
}

/** 三类杂兵：兵士守得稳、山贼攻得狠、盗贼跑得快。 */
const FOES: FoeTemplate[] = [
  {
    key: "soldier",
    name: "兵士",
    title: "散兵",
    group: "散兵游勇",
    blurb: "一队溃散兵士在野地里游荡，撞上便是一场厮杀。",
    force: 60,
    intellect: 26,
    defense: 62,
    speed: 50,
    baseTroops: 95,
    growth: 7,
    color: "#475569",
    accent: "#e2e8f0",
  },
  {
    key: "bandit",
    name: "山贼",
    title: "落草",
    group: "山贼拦路",
    blurb: "山贼从林间杀出，横刀拦路，摆明了要劫这趟行军。",
    force: 72,
    intellect: 20,
    defense: 48,
    speed: 54,
    baseTroops: 100,
    growth: 7,
    color: "#a16207",
    accent: "#fde68a",
  },
  {
    key: "thief",
    name: "盗贼",
    title: "飞贼",
    group: "盗贼伏击",
    blurb: "盗贼摸进行军路线，想趁队伍不备劫走粮草辎重。",
    force: 58,
    intellect: 36,
    defense: 40,
    speed: 74,
    baseTroops: 80,
    growth: 6,
    color: "#7c3aed",
    accent: "#ddd6fe",
  },
];

const SQUAD_MARKS = ["甲", "乙", "丙", "丁"];

const clampInt = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.trunc(value)));

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

function leaderEnemy(leaderId: string, chapterIndex: number, ordinal: number): SagaEnemy {
  const def = SAGA_GENERAL_BY_ID.get(leaderId) ?? SAGA_GENERAL_BY_ID.get("huangjin_lishi")!;
  const level = 1 + chapterIndex * 4 + Math.floor(ordinal / 3);
  const troops = Math.max(
    50,
    Math.round((def.baseTroops + level * def.growth) * (1 + chapterIndex * 0.05) * 0.8),
  );
  const bonus = traitStats(def);
  return {
    id: def.id,
    name: def.name,
    title: def.title,
    level,
    troops,
    maxTroops: troops,
    force: def.force + bonus.force + Math.floor(level * 1.3),
    intellect: def.intellect + bonus.intellect + Math.floor(level * 0.9),
    defense: def.defense + bonus.defense + Math.floor(level * 1.1),
    speed: def.speed + bonus.speed + Math.floor(level * 0.6),
    tactics: tacticsFor(def, level),
    traits: def.traits,
    color: def.color,
    accent: def.accent,
    // 野外头目只是拦路的，不开放招降，免得刷遭遇把名将成批带走。
    recruitable: false,
    recruitHard: false,
    boss: false,
  };
}

function squadEnemy(
  foe: FoeTemplate,
  chapterIndex: number,
  ordinal: number,
  slot: number,
  withLeader: boolean,
): SagaEnemy {
  const level = 1 + chapterIndex * 3 + Math.floor(ordinal / 2);
  const troops = Math.max(
    40,
    Math.round(
      (foe.baseTroops + level * foe.growth) *
        (1 + chapterIndex * 0.07) *
        (withLeader ? 0.9 : 1),
    ),
  );
  return {
    id: `foe_${foe.key}_${ordinal}_${slot}`,
    name: `${foe.name}${SQUAD_MARKS[slot] ?? slot + 1}`,
    title: foe.title,
    level,
    troops,
    maxTroops: troops,
    force: foe.force + Math.floor(level * 1.1),
    intellect: foe.intellect + Math.floor(level * 0.6),
    defense: foe.defense + Math.floor(level * 1),
    speed: foe.speed + Math.floor(level * 0.5),
    tactics: [],
    color: foe.color,
    accent: foe.accent,
    recruitable: false,
    recruitHard: false,
    boss: false,
  };
}

/**
 * 第 ordinal 场野外遭遇（从 0 起）的敌军编成；同种子同序号结果固定。
 * 1~4 队：可能全是兵士 / 山贼 / 盗贼，也可能由一名本章敌将领头。
 */
export function sagaEncounterFor(run: SagaRun, ordinal: number): SagaNode {
  const index = clampInt(ordinal, 0, SAGA_MAX_ENCOUNTERS - 1);
  const chapter =
    SAGA_CHAPTERS[clampInt(run.startSave.chapter, 0, SAGA_CHAPTERS.length - 1)];
  const rng = mulberry32((run.seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0);
  const foe = pick(rng, FOES);
  const hasLeader = rng() < 0.38;
  const squad = 1 + Math.floor(rng() * 3);
  const enemies: SagaEnemy[] = [];
  let leaderName = "";
  if (hasLeader) {
    const leader = leaderEnemy(pick(rng, chapter.field), chapter.index, index);
    leaderName = leader.name;
    enemies.push(leader);
  }
  for (let slot = 0; slot < squad; slot++) {
    enemies.push(squadEnemy(foe, chapter.index, index, slot, hasLeader));
  }
  const rewardGold =
    8 + chapter.index * 4 + enemies.length * 4 + (hasLeader ? 12 : 0) + Math.floor(index / 2) * 2;
  const rewardExp =
    8 + chapter.index * 3 + enemies.length * 3 + (hasLeader ? 10 : 0) + Math.floor(index / 2);
  const name = hasLeader ? `${foe.group}·${leaderName}` : foe.group;
  return {
    kind: "battle",
    name,
    blurb: `${foe.blurb}${hasLeader ? `领头的正是${leaderName}。` : ""}`.slice(0, 120),
    chapter: chapter.index,
    enemies,
    rewardGold,
    rewardExp,
    enemyFormation: pick(rng, SAGA_FORMATIONS).id,
  };
}
