/**
 * 每日试炼·浮空回廊（动作版，纯函数，客户端与服务端共用）。
 *
 * 一局 = 一条横版回廊：玩家用左右移动 / 跳跃 / 斩击 / 弧斩 / 星屑飞溅 /
 * 格挡 / 回复结晶，在浮空城的每一层先探索一扇野区门（战斗 / 精英 / 宝箱 / 营地），
 * 再挑战层主。生命跨房间保留，击杀获得经验，升级提升生命上限。
 *
 * 每帧（1/60 秒）只记录一个按键位掩码；客户端实时演算做动画，交卷时服务端
 * 用同一份输入序列逐帧重放。物理只用整数运算、随机数来自种子状态，
 * 两端结果逐帧一致，因此不需要信任浏览器上报的血量或伤害。
 */

export const TRIAL_MAX_FLOORS = 7;

export const TRIAL_HERO_MAX_HP = 100;
export const TRIAL_LEVEL_HP = 10;
export const TRIAL_ROOM_HEAL = 6;
export const TRIAL_REST_HEAL = 28;
export const TRIAL_POTION_COUNT = 2;
export const TRIAL_POTION_HEAL = 32;
export const TRIAL_ENRAGE_RATIO = 0.4;

/** 动作模拟的分辨率：480×270 像素画布整数倍放大，做出红白机式的颗粒感。 */
export const TRIAL_VIEW_W = 480;
export const TRIAL_VIEW_H = 270;
export const TRIAL_GROUND_Y = 220;
export const TRIAL_WORLD_W = 1200;
export const TRIAL_HERO_START_X = 56;
/** 每层两扇野区门的横坐标（与生成顺序一一对应）。 */
export const TRIAL_DOOR_X = [420, 620] as const;
export const TRIAL_BOSS_DOOR_X = 980;
export const TRIAL_ENEMY_SPAWN_X = 880;
export const TRIAL_INTERACT_RADIUS = 44;

/** 固定步长：客户端与服务端都按 60Hz 推进，一帧一个输入掩码。 */
export const TRIAL_TICK_MS = 1000 / 60;
/** 输入帧上限：配置最长 1800 秒 + 5 秒宽限。 */
export const TRIAL_MAX_FRAMES = 60 * 1805;

/** 输入位掩码：一帧内按下的所有键。 */
export const TRIAL_INPUT = {
  left: 1,
  right: 2,
  jump: 4,
  attack: 8,
  heavy: 16,
  burst: 32,
  guard: 64,
  potion: 128,
  interact: 256,
} as const;

const HERO_SPEED = 2;
const HERO_GUARD_SPEED = 1;
const HERO_JUMP_V = -9;
const HERO_GRAVITY = 1;
const HERO_INVULN = 40;
const HERO_HURT_FLASH = 12;
const HERO_KNOCKBACK = 8;

const SLASH = { total: 16, hitStart: 4, hitEnd: 8, min: 12, max: 16, range: 38 } as const;
const ARC = { total: 24, hitStart: 7, hitEnd: 12, min: 19, max: 24, range: 54, cooldown: 160 } as const;
const BURST = { total: 30, hitStart: 9, hitEnd: 16, min: 30, max: 38, radius: 76, cooldown: 520 } as const;

const GUARD_BLOCK = 14;
const COMBO_WINDOW = 140;
const COMBO_MAX = 5;
const COMBO_BONUS = 2;

const ENEMY_SPEED = 1;
const ENEMY_SPEED_ENRAGED = 2;
const ENEMY_ATTACK_TRIGGER = 38;
const ENEMY_WINDUP = 24;
const ENEMY_WINDUP_BOSS = 20;
const ENEMY_STRIKE_FRAMES = 10;
const ENEMY_RECOVER = 26;
const ENEMY_GUARD_FRAMES = 40;
const ENEMY_CHARGE_FRAMES = 30;
const ENEMY_STRIKE_RANGE = 46;
/** 跳得足够高（离地 34px）就能躲开近战横斩。 */
const ENEMY_DODGE_HEIGHT = 34;
/** 角色离地超过这个高度时剑技打不到地面怪。 */
const HERO_GROUND_REACH = 30;

export type TrialSkillId = "slash" | "arc" | "guard" | "burst";

export interface TrialSkillMeta {
  id: TrialSkillId;
  name: string;
  desc: string;
}

export const TRIAL_SKILLS: TrialSkillMeta[] = [
  { id: "slash", name: "斩击", desc: `近身横斩，造成 ${SLASH.min}~${SLASH.max} 伤害` },
  {
    id: "arc",
    name: "弧斩",
    desc: `攻击范围更大，造成 ${ARC.min}~${ARC.max} 伤害`,
  },
  {
    id: "guard",
    name: "格挡",
    desc: `按住减伤 ${GUARD_BLOCK}，移动变慢`,
  },
  {
    id: "burst",
    name: "星屑飞溅",
    desc: `以自身为中心爆发，造成 ${BURST.min}~${BURST.max} 伤害`,
  },
];

export type TrialIntent = "attack" | "guard" | "charge";
export type TrialWaveShape =
  | "mire"
  | "wisp"
  | "golem"
  | "serpent"
  | "thorn"
  | "mirror"
  | "warden";

export interface TrialWave {
  key: string;
  name: string;
  title: string;
  shape: TrialWaveShape;
  hp: number;
  atk: number;
  /** 意图循环；`charge` 后下一次攻击按重击结算。 */
  pattern: TrialIntent[];
  /** 层主残血后伤害提高，野怪不带。 */
  enrage?: boolean;
}

export type TrialRelicId =
  | "whetstone"
  | "ironbark"
  | "starcore"
  | "bloodpact"
  | "leech"
  | "piercer"
  | "ember"
  | "lantern";

export interface TrialRelicMeta {
  id: TrialRelicId;
  name: string;
  desc: string;
}

/** 装备可重复叠加，效果按持有数量累加。 */
export const TRIAL_RELICS: Record<TrialRelicId, TrialRelicMeta> = {
  whetstone: { id: "whetstone", name: "锐刃", desc: `斩击伤害 +3` },
  ironbark: { id: "ironbark", name: "翠绿护腕", desc: `格挡减伤 +5` },
  starcore: { id: "starcore", name: "迅捷之靴", desc: "弧斩 / 星屑冷却缩短" },
  bloodpact: { id: "bloodpact", name: "生命结晶", desc: "生命上限 +15，立即回复 15" },
  leech: { id: "leech", name: "吸魂戒指", desc: "击破敌人额外回复 6 生命" },
  piercer: { id: "piercer", name: "破甲短剑", desc: "攻击无视最多 6 点护盾" },
  ember: { id: "ember", name: "烈焰附魔", desc: "星屑飞溅伤害 +6" },
  lantern: { id: "lantern", name: "向导之灯", desc: "进入每个房间时回复 4 生命" },
};

const RELIC_IDS = Object.keys(TRIAL_RELICS) as TrialRelicId[];

export type TrialRoomKind = "fight" | "elite" | "treasure" | "rest";

export interface TrialRoom {
  kind: TrialRoomKind;
  /** 门上的主标题。 */
  title: string;
  /** 门上的副标题。 */
  hint: string;
  wave?: TrialWave;
  relic?: TrialRelicId;
}

export interface TrialFloor {
  /** 本层可选的野区门。 */
  rooms: TrialRoom[];
  /** 层主房：击败后进入下一层。 */
  boss: TrialRoom;
}

export interface TrialDungeon {
  version: 5;
  /** 地图与伤害浮动共用的种子，客户端与服务端必须相同。 */
  seed: number;
  heroHp: number;
  floors: TrialFloor[];
}

const MINION_WAVES: TrialWave[] = [
  { key: "mire", name: "苔泥团", title: "湿滑的低阶魔物", shape: "mire", hp: 30, atk: 7, pattern: ["attack", "attack"] },
  { key: "wisp", name: "幽焰", title: "会呼吸的鬼火", shape: "wisp", hp: 38, atk: 8, pattern: ["attack", "guard", "attack"] },
  { key: "golem", name: "石纹傀儡", title: "残破的守门石像", shape: "golem", hp: 54, atk: 9, pattern: ["attack", "guard", "guard"] },
  { key: "serpent", name: "蛇影", title: "盘踞在回廊的暗影", shape: "serpent", hp: 64, atk: 10, pattern: ["attack", "attack", "charge"] },
  { key: "thorn", name: "棘刺妖", title: "会把疼痛还给你", shape: "thorn", hp: 46, atk: 9, pattern: ["attack", "charge", "attack"] },
  { key: "mirror", name: "镜影", title: "复制你动作的幻象", shape: "mirror", hp: 58, atk: 8, pattern: ["guard", "attack", "attack"] },
];

const BOSS_POOL: { name: string; title: string; shape: TrialWaveShape; pattern: TrialIntent[] }[] = [
  { name: "苔泥巨像", title: "第一层的守门人", shape: "golem", pattern: ["attack", "guard", "attack"] },
  { name: "幽焰之灵", title: "吞掉过整支队伍", shape: "wisp", pattern: ["attack", "charge", "attack"] },
  { name: "石纹守卫", title: "迷宫深处的铁壁", shape: "golem", pattern: ["guard", "attack", "attack"] },
  { name: "蛇影女王", title: "盘绕在转移门旁", shape: "serpent", pattern: ["attack", "charge", "guard", "attack"] },
  { name: "棘刺暴君", title: "把疼痛加倍奉还", shape: "thorn", pattern: ["attack", "attack", "charge"] },
  { name: "镜影骑士", title: "复制所有剑技", shape: "mirror", pattern: ["guard", "charge", "attack"] },
  { name: "浮游城之王", title: "塔顶的执灯人", shape: "warden", pattern: ["attack", "charge", "attack", "guard"] },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, list: T[]): T {
  return list[Math.floor(random() * list.length)];
}

function shuffled<T>(random: () => number, list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function scaleWave(base: TrialWave, floorIndex: number, hpMult: number, atkBonus: number): TrialWave {
  return {
    ...base,
    hp: Math.max(1, Math.round(base.hp * (1 + floorIndex * 0.12) * hpMult)),
    atk: base.atk + Math.floor(floorIndex * 0.6) + atkBonus,
  };
}

function bossForFloor(floorIndex: number): TrialWave {
  const boss = BOSS_POOL[Math.min(floorIndex, BOSS_POOL.length - 1)];
  return {
    key: boss.shape,
    name: boss.name,
    title: boss.title,
    shape: boss.shape,
    hp: Math.round(90 * (1 + floorIndex * 0.2)),
    atk: 11 + Math.floor(floorIndex * 1.2),
    pattern: boss.pattern,
    enrage: true,
  };
}

function monsterForFloor(random: () => number, floorIndex: number, elite: boolean): TrialWave {
  if (elite) {
    const base = pick(random, [MINION_WAVES[3], MINION_WAVES[4], MINION_WAVES[5]]);
    return scaleWave(base, floorIndex, 1.5, 2);
  }
  const poolSize = Math.min(MINION_WAVES.length, 2 + floorIndex);
  return scaleWave(MINION_WAVES[Math.floor(random() * poolSize)], floorIndex, 1, 0);
}

function buildRoom(random: () => number, floorIndex: number, kind: TrialRoomKind): TrialRoom {
  if (kind === "rest") {
    return { kind, title: "营地", hint: `休整 · 回复 ${TRIAL_REST_HEAL} 生命` };
  }
  if (kind === "treasure") {
    const relic = pick(random, RELIC_IDS);
    return { kind, title: "宝箱", hint: `拾取装备：${TRIAL_RELICS[relic].name}`, relic };
  }
  if (kind === "elite") {
    const relic = pick(random, RELIC_IDS);
    const wave = monsterForFloor(random, floorIndex, true);
    return {
      kind,
      title: wave.name,
      hint: `精英怪 · 击破获得「${TRIAL_RELICS[relic].name}」`,
      wave,
      relic,
    };
  }
  const wave = monsterForFloor(random, floorIndex, false);
  return { kind, title: wave.name, hint: wave.title, wave };
}

/** 生成整座塔：层数越多，怪越硬；每层两个野区门 + 层主房。 */
export function generateTrialDungeon(
  floorCount: number,
  random: () => number = Math.random,
): TrialDungeon {
  const total = Math.min(TRIAL_MAX_FLOORS, Math.max(1, Math.trunc(Number(floorCount) || 1)));
  const seed = Math.floor(random() * 0xffffffff) >>> 0;
  const mapRandom = mulberry32(seed);
  const floors: TrialFloor[] = [];

  for (let floor = 0; floor < total; floor += 1) {
    const kinds = shuffled(mapRandom, [
      "fight",
      "fight",
      "elite",
      "treasure",
      "rest",
    ] as TrialRoomKind[]).slice(0, 2);
    if (!kinds.some((kind) => kind === "fight" || kind === "elite")) {
      kinds[0] = "fight";
    }
    floors.push({
      rooms: shuffled(
        mapRandom,
        kinds.map((kind) => buildRoom(mapRandom, floor, kind)),
      ),
      boss: {
        kind: "fight",
        title: "层主房",
        hint: "进入后挑战层主，击败才能上楼",
        wave: bossForFloor(floor),
      },
    });
  }

  return { version: 5, seed, heroHp: TRIAL_HERO_MAX_HP, floors };
}

function normalizeWave(raw: unknown): TrialWave | null {
  if (!raw || typeof raw !== "object") return null;
  const wave = raw as Partial<TrialWave>;
  if (
    typeof wave.key !== "string" ||
    typeof wave.name !== "string" ||
    !Number.isFinite(Number(wave.hp)) ||
    !Number.isFinite(Number(wave.atk)) ||
    !Array.isArray(wave.pattern) ||
    wave.pattern.length === 0
  ) {
    return null;
  }
  const pattern = wave.pattern.filter(
    (intent): intent is TrialIntent =>
      intent === "attack" || intent === "guard" || intent === "charge",
  );
  if (pattern.length === 0) return null;
  return {
    key: wave.key,
    name: wave.name,
    title: typeof wave.title === "string" ? wave.title : "",
    shape: (wave.shape ?? "mire") as TrialWaveShape,
    hp: Math.max(1, Math.trunc(Number(wave.hp))),
    atk: Math.max(0, Math.trunc(Number(wave.atk))),
    pattern,
    ...(wave.enrage === true ? { enrage: true } : {}),
  };
}

function normalizeRoom(raw: unknown): TrialRoom | null {
  if (!raw || typeof raw !== "object") return null;
  const room = raw as Partial<TrialRoom>;
  const kinds: TrialRoomKind[] = ["fight", "elite", "treasure", "rest"];
  if (!room.kind || !kinds.includes(room.kind)) return null;
  if (typeof room.title !== "string") return null;
  const relic =
    room.relic && RELIC_IDS.includes(room.relic as TrialRelicId)
      ? (room.relic as TrialRelicId)
      : undefined;
  const wave = room.wave === undefined ? undefined : normalizeWave(room.wave);
  if ((room.kind === "fight" || room.kind === "elite") && !wave) return null;
  if ((room.kind === "treasure" || room.kind === "elite") && !relic) return null;
  return {
    kind: room.kind,
    title: room.title,
    hint: typeof room.hint === "string" ? room.hint : "",
    ...(wave ? { wave } : {}),
    ...(relic ? { relic } : {}),
  };
}

/** 旧版对局（答题 / 回合制浮游城）版本号不同，交给调用方清理。 */
export function parseTrialDungeon(raw: unknown): TrialDungeon | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const it = value as Partial<TrialDungeon>;
  if (it.version !== 5 || !Array.isArray(it.floors) || it.floors.length === 0) return null;

  const floors: TrialFloor[] = [];
  for (const rawFloor of it.floors) {
    if (!rawFloor || !Array.isArray(rawFloor.rooms) || rawFloor.rooms.length === 0) return null;
    const rooms = rawFloor.rooms.map(normalizeRoom);
    if (rooms.some((room) => room === null)) return null;
    const boss = normalizeRoom(rawFloor.boss);
    if (!boss || !boss.wave) return null;
    floors.push({ rooms: rooms as TrialRoom[], boss });
  }

  return {
    version: 5,
    seed: Number.isFinite(Number(it.seed)) ? Number(it.seed) >>> 0 : 0,
    heroHp: Math.max(1, Math.trunc(Number(it.heroHp) || TRIAL_HERO_MAX_HP)),
    floors,
  };
}

export type TrialAttackKind = "slash" | "arc" | "burst";

export interface TrialAttackState {
  kind: TrialAttackKind;
  frame: number;
  /** 本次挥砍是否已经命中过（防止多帧连扣）。 */
  hit: boolean;
}

export interface TrialHeroState {
  x: number;
  y: number;
  vy: number;
  facing: 1 | -1;
  moving: boolean;
  hp: number;
  maxHp: number;
  level: number;
  exp: number;
  potions: number;
  guarding: boolean;
  attack: TrialAttackState | null;
  cooldownArc: number;
  cooldownBurst: number;
  invuln: number;
  hurtFlash: number;
  combo: number;
  comboTimer: number;
  relics: TrialRelicId[];
  /** 累计造成的有效伤害（对账 / 测试用）。 */
  totalDealt: number;
  /** 累计承受的伤害（格挡后）。 */
  totalTaken: number;
}

export type TrialEnemyMode = "approach" | "windup" | "strike" | "recover" | "guard" | "charge";

export interface TrialEnemyState {
  boss: boolean;
  floor: number;
  name: string;
  shape: TrialWaveShape;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  pattern: TrialIntent[];
  intentIndex: number;
  mode: TrialEnemyMode;
  timer: number;
  shield: number;
  charged: boolean;
  hurtFlash: number;
  enraged: boolean;
  facing: 1 | -1;
  /** 本次挥击已经结算过伤害。 */
  struck: boolean;
}

export type TrialPhase = "explore" | "fight" | "over" | "won";

export type TrialEvent =
  | { type: "hit"; x: number; y: number; amount: number; combo: number }
  | { type: "hurt"; x: number; y: number; amount: number; blocked: number }
  | { type: "heal"; x: number; y: number; amount: number }
  | { type: "block"; x: number; y: number; amount: number }
  | { type: "kill"; x: number; y: number; name: string }
  | { type: "relic"; x: number; y: number; relic: TrialRelicId }
  | { type: "levelup"; x: number; y: number; level: number }
  | { type: "door"; x: number; y: number; label: string };

export interface TrialGameState {
  version: 5;
  seed: number;
  /** 战斗随机数状态：服务端重放时与客户端逐帧一致。 */
  rngState: number;
  dungeon: TrialDungeon;
  tick: number;
  phase: TrialPhase;
  floorIndex: number;
  fieldCleared: boolean;
  bossFight: boolean;
  roomIndex: number | null;
  hero: TrialHeroState;
  enemy: TrialEnemyState | null;
  /** 本帧发生的表现事件，渲染层消费后由下一步清空。 */
  events: TrialEvent[];
  kills: number;
  /** 上一帧的输入掩码，用来识别「刚按下」。 */
  prevMask: number;
}

interface RelicEffects {
  slashBonus: number;
  guardBonus: number;
  burstBonus: number;
  arcCdCut: number;
  burstCdCut: number;
  maxHpBonus: number;
  killHeal: number;
  pierce: number;
  entryHeal: number;
}

function effectsFor(relics: TrialRelicId[]): RelicEffects {
  const count = (id: TrialRelicId) => relics.filter((relic) => relic === id).length;
  return {
    slashBonus: 3 * count("whetstone"),
    guardBonus: 5 * count("ironbark"),
    burstBonus: 6 * count("ember"),
    arcCdCut: 30 * count("starcore"),
    burstCdCut: 90 * count("starcore"),
    maxHpBonus: 15 * count("bloodpact"),
    killHeal: 6 * count("leech"),
    pierce: 6 * count("piercer"),
    entryHeal: 4 * count("lantern"),
  };
}

/** 升到下一级所需经验。 */
export function expToNext(level: number): number {
  return 40 + Math.max(0, level - 1) * 20;
}

export function createTrialGame(dungeon: TrialDungeon): TrialGameState {
  return {
    version: 5,
    seed: dungeon.seed,
    rngState: (dungeon.seed ^ 0x9e3779b9) >>> 0,
    dungeon,
    tick: 0,
    phase: "explore",
    floorIndex: 0,
    fieldCleared: false,
    bossFight: false,
    roomIndex: null,
    hero: {
      x: TRIAL_HERO_START_X,
      y: TRIAL_GROUND_Y,
      vy: 0,
      facing: 1,
      moving: false,
      hp: dungeon.heroHp,
      maxHp: dungeon.heroHp,
      level: 1,
      exp: 0,
      potions: TRIAL_POTION_COUNT,
      guarding: false,
      attack: null,
      cooldownArc: 0,
      cooldownBurst: 0,
      invuln: 0,
      hurtFlash: 0,
      combo: 0,
      comboTimer: 0,
      relics: [],
      totalDealt: 0,
      totalTaken: 0,
    },
    enemy: null,
    events: [],
    kills: 0,
    prevMask: 0,
  };
}

function nextRandom(state: TrialGameState): number {
  let a = state.rngState;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  state.rngState = a;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randomInt(state: TrialGameState, min: number, max: number): number {
  return min + Math.floor(nextRandom(state) * (max - min + 1));
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function comboBonus(combo: number): number {
  return Math.min(COMBO_MAX * COMBO_BONUS, combo * COMBO_BONUS);
}

function attackDamage(state: TrialGameState, kind: TrialAttackKind): number {
  const fx = effectsFor(state.hero.relics);
  const bonus = comboBonus(state.hero.combo);
  if (kind === "arc") return randomInt(state, ARC.min + bonus, ARC.max + bonus);
  if (kind === "burst") return randomInt(state, BURST.min + fx.burstBonus + bonus, BURST.max + fx.burstBonus + bonus);
  return randomInt(state, SLASH.min + fx.slashBonus + bonus, SLASH.max + fx.slashBonus + bonus);
}

function healHero(state: TrialGameState, amount: number, x: number, y: number): void {
  const hero = state.hero;
  const healed = Math.min(Math.max(0, amount), Math.max(0, hero.maxHp - hero.hp));
  if (healed <= 0) return;
  hero.hp += healed;
  state.events.push({ type: "heal", x, y, amount: healed });
}

function grantRelic(state: TrialGameState, relic: TrialRelicId): void {
  const hero = state.hero;
  hero.relics = [...hero.relics, relic];
  const fx = effectsFor(hero.relics);
  const nextMax = state.dungeon.heroHp + fx.maxHpBonus + (hero.level - 1) * TRIAL_LEVEL_HP;
  const gained = Math.max(0, nextMax - hero.maxHp);
  hero.maxHp = nextMax;
  if (gained > 0) hero.hp = Math.min(hero.maxHp, hero.hp + gained);
  if (relic === "bloodpact") healHero(state, 15, hero.x, hero.y - 40);
  state.events.push({ type: "relic", x: hero.x, y: hero.y - 48, relic });
}

function grantExp(state: TrialGameState, amount: number): void {
  const hero = state.hero;
  hero.exp += amount;
  while (hero.exp >= expToNext(hero.level)) {
    hero.exp -= expToNext(hero.level);
    hero.level += 1;
    hero.maxHp += TRIAL_LEVEL_HP;
    hero.hp = Math.min(hero.maxHp, hero.hp + TRIAL_LEVEL_HP);
    state.events.push({ type: "levelup", x: hero.x, y: hero.y - 52, level: hero.level });
  }
}

function spawnEnemy(state: TrialGameState, wave: TrialWave, boss: boolean): void {
  state.enemy = {
    boss,
    floor: state.floorIndex,
    name: wave.name,
    shape: wave.shape,
    x: TRIAL_ENEMY_SPAWN_X,
    y: TRIAL_GROUND_Y,
    hp: wave.hp,
    maxHp: wave.hp,
    atk: wave.atk,
    pattern: [...wave.pattern],
    intentIndex: 0,
    mode: "approach",
    timer: 0,
    shield: 0,
    charged: false,
    hurtFlash: 0,
    enraged: false,
    facing: -1,
    struck: false,
  };
}

function applyEntryHeal(state: TrialGameState): void {
  const fx = effectsFor(state.hero.relics);
  healHero(state, fx.entryHeal, state.hero.x, state.hero.y - 44);
}

function killEnemy(state: TrialGameState): void {
  const enemy = state.enemy;
  if (!enemy) return;
  const hero = state.hero;
  const floor = state.dungeon.floors[state.floorIndex];
  const room = state.roomIndex !== null ? floor?.rooms[state.roomIndex] : undefined;

  enemy.hp = 0;
  state.kills += 1;
  state.events.push({ type: "kill", x: enemy.x, y: enemy.y - 46, name: enemy.name });

  const xp = enemy.boss
    ? 45 + state.floorIndex * 8
    : room?.kind === "elite"
      ? 28 + state.floorIndex * 5
      : 14 + state.floorIndex * 3;
  grantExp(state, xp);

  // 精英的装备在击破后到手；宝箱在进门时就已经给过。
  if (room?.kind === "elite" && room.relic) grantRelic(state, room.relic);

  const fx = effectsFor(hero.relics);
  healHero(state, TRIAL_ROOM_HEAL + fx.killHeal, enemy.x, enemy.y - 30);

  hero.combo = 0;
  hero.comboTimer = 0;
  state.enemy = null;

  if (enemy.boss) {
    state.floorIndex += 1;
    state.fieldCleared = false;
    state.bossFight = false;
    state.roomIndex = null;
    hero.x = TRIAL_HERO_START_X;
    hero.y = TRIAL_GROUND_Y;
    hero.vy = 0;
    state.phase = state.floorIndex >= state.dungeon.floors.length ? "won" : "explore";
  } else {
    state.fieldCleared = true;
    state.roomIndex = null;
    state.phase = "explore";
  }
}

function resolveHeroHit(state: TrialGameState, kind: TrialAttackKind): void {
  const enemy = state.enemy;
  if (!enemy || enemy.hp <= 0) return;
  const hero = state.hero;
  const fx = effectsFor(hero.relics);
  let damage = attackDamage(state, kind);

  if (enemy.shield > 0) {
    const pierce = Math.min(fx.pierce, enemy.shield);
    enemy.shield -= pierce;
    const absorbed = Math.min(enemy.shield, damage);
    enemy.shield -= absorbed;
    damage -= absorbed;
    if (absorbed > 0) {
      state.events.push({ type: "block", x: enemy.x, y: enemy.y - 40, amount: absorbed });
    }
  }

  if (damage > 0) {
    enemy.hp -= damage;
    hero.totalDealt += damage;
    enemy.hurtFlash = 10;
    enemy.x = clamp(enemy.x + hero.facing * (kind === "burst" ? 2 : 8), 40, TRIAL_WORLD_W - 40);
    hero.combo = Math.min(COMBO_MAX, hero.combo + 1);
    hero.comboTimer = COMBO_WINDOW;
    state.events.push({
      type: "hit",
      x: enemy.x,
      y: enemy.y - 44,
      amount: damage,
      combo: hero.combo,
    });
  }

  if (enemy.hp <= 0) killEnemy(state);
}

function beginEnemyBehavior(state: TrialGameState): void {
  const enemy = state.enemy;
  if (!enemy) return;
  const intent = enemy.pattern[enemy.intentIndex % enemy.pattern.length] ?? "attack";
  if (intent === "guard") {
    enemy.mode = "guard";
    enemy.timer = ENEMY_GUARD_FRAMES;
    enemy.shield = Math.min(30, enemy.shield + 12);
  } else if (intent === "charge") {
    enemy.mode = "charge";
    enemy.timer = ENEMY_CHARGE_FRAMES;
  } else {
    enemy.mode = "windup";
    enemy.timer = enemy.boss ? ENEMY_WINDUP_BOSS : ENEMY_WINDUP;
  }
}

function applyEnemyHit(state: TrialGameState): void {
  const enemy = state.enemy;
  if (!enemy) return;
  const hero = state.hero;
  const heroX = hero.x;
  const heroY = hero.y - 40;

  let raw = enemy.atk;
  if (enemy.charged) raw = Math.round(raw * 2.2);
  if (enemy.enraged) raw = Math.round(raw * 1.35);
  enemy.charged = false;

  const fx = effectsFor(hero.relics);
  const blocked = hero.guarding ? Math.min(raw, GUARD_BLOCK + fx.guardBonus) : 0;
  const taken = Math.max(0, raw - blocked);

  if (blocked > 0) {
    state.events.push({ type: "block", x: heroX, y: heroY, amount: blocked });
    hero.x = clamp(hero.x + enemy.facing * 3, 30, TRIAL_WORLD_W - 30);
  }
  if (taken > 0 && hero.invuln === 0) {
    hero.hp = Math.max(0, hero.hp - taken);
    hero.totalTaken += taken;
    hero.invuln = HERO_INVULN;
    hero.hurtFlash = HERO_HURT_FLASH;
    hero.combo = 0;
    hero.comboTimer = 0;
    hero.x = clamp(hero.x + enemy.facing * HERO_KNOCKBACK, 30, TRIAL_WORLD_W - 30);
    state.events.push({ type: "hurt", x: heroX, y: heroY, amount: taken, blocked });
    if (hero.hp <= 0) state.phase = "over";
  }
}

function stepEnemy(state: TrialGameState): void {
  const enemy = state.enemy;
  if (!enemy || state.phase !== "fight") return;
  const hero = state.hero;

  enemy.hurtFlash = Math.max(0, enemy.hurtFlash - 1);
  enemy.enraged = Boolean(enemy.boss && enemy.hp <= enemy.maxHp * TRIAL_ENRAGE_RATIO);
  enemy.facing = hero.x >= enemy.x ? 1 : -1;

  const dx = hero.x - enemy.x;
  const distance = Math.abs(dx);
  const speed = enemy.enraged ? ENEMY_SPEED_ENRAGED : ENEMY_SPEED;

  switch (enemy.mode) {
    case "approach":
      if (distance > ENEMY_ATTACK_TRIGGER) {
        enemy.x += Math.sign(dx) * speed;
        enemy.x = clamp(enemy.x, 40, TRIAL_WORLD_W - 40);
      } else {
        beginEnemyBehavior(state);
      }
      break;
    case "windup":
      enemy.timer -= 1;
      if (enemy.timer <= 0) {
        enemy.mode = "strike";
        enemy.timer = ENEMY_STRIKE_FRAMES;
        enemy.struck = false;
      }
      break;
    case "strike":
      if (!enemy.struck) {
        enemy.struck = true;
        const inRange = Math.abs(hero.x - enemy.x) <= ENEMY_STRIKE_RANGE;
        const lowEnough = hero.y >= TRIAL_GROUND_Y - ENEMY_DODGE_HEIGHT;
        if (inRange && lowEnough) applyEnemyHit(state);
      }
      enemy.timer -= 1;
      if (enemy.timer <= 0) {
        enemy.mode = "recover";
        enemy.timer = ENEMY_RECOVER;
      }
      break;
    case "recover":
      enemy.timer -= 1;
      if (enemy.timer <= 0) {
        enemy.intentIndex += 1;
        enemy.mode = "approach";
      }
      break;
    case "guard":
      enemy.timer -= 1;
      if (enemy.timer <= 0) {
        enemy.intentIndex += 1;
        enemy.mode = "approach";
      }
      break;
    case "charge":
      enemy.timer -= 1;
      if (enemy.timer <= 0) {
        enemy.charged = true;
        enemy.intentIndex += 1;
        enemy.mode = "approach";
      }
      break;
  }
}

export interface TrialInteractTarget {
  kind: "room" | "boss";
  index: number | null;
  title: string;
}

/** 当前站在哪扇门前：渲染层用来高亮门与显示按键提示。 */
export function trialInteractTarget(state: TrialGameState): TrialInteractTarget | null {
  if (state.phase !== "explore") return null;
  const floor = state.dungeon.floors[state.floorIndex];
  if (!floor) return null;
  const heroX = state.hero.x;
  if (!state.fieldCleared) {
    for (let i = 0; i < floor.rooms.length; i += 1) {
      const doorX = TRIAL_DOOR_X[i] ?? TRIAL_DOOR_X[TRIAL_DOOR_X.length - 1];
      if (Math.abs(heroX - doorX) <= TRIAL_INTERACT_RADIUS) {
        return { kind: "room", index: i, title: floor.rooms[i].title };
      }
    }
  }
  if (Math.abs(heroX - TRIAL_BOSS_DOOR_X) <= TRIAL_INTERACT_RADIUS) {
    return { kind: "boss", index: null, title: floor.boss.wave?.name ?? "层主" };
  }
  return null;
}

function tryInteract(state: TrialGameState): void {
  const target = trialInteractTarget(state);
  if (!target) return;
  const floor = state.dungeon.floors[state.floorIndex];
  if (!floor) return;
  const hero = state.hero;

  state.events.push({ type: "door", x: hero.x, y: hero.y - 52, label: target.title });
  applyEntryHeal(state);

  if (target.kind === "boss") {
    if (!floor.boss.wave) return;
    state.bossFight = true;
    state.roomIndex = null;
    spawnEnemy(state, floor.boss.wave, true);
    state.phase = "fight";
    return;
  }

  const index = target.index ?? 0;
  const room = floor.rooms[index];
  if (!room) return;
  if (room.kind === "treasure") {
    if (room.relic) grantRelic(state, room.relic);
    state.fieldCleared = true;
    return;
  }
  if (room.kind === "rest") {
    healHero(state, TRIAL_REST_HEAL, hero.x, hero.y - 44);
    state.fieldCleared = true;
    return;
  }
  if (!room.wave) return;
  state.bossFight = false;
  state.roomIndex = index;
  spawnEnemy(state, room.wave, false);
  state.phase = "fight";
}

/**
 * 推进一步（1/60 秒）。`mask` 是 TRIAL_INPUT 的位组合；
 * 只读本帧输入与状态，所有结果由整数运算与种子随机数决定。
 */
export function stepTrialGame(state: TrialGameState, mask: number): void {
  state.events = [];
  if (state.phase === "over" || state.phase === "won") return;

  const input = mask | 0;
  const pressed = input & ~state.prevMask;
  state.prevMask = input;
  state.tick += 1;

  const hero = state.hero;
  hero.cooldownArc = Math.max(0, hero.cooldownArc - 1);
  hero.cooldownBurst = Math.max(0, hero.cooldownBurst - 1);
  hero.invuln = Math.max(0, hero.invuln - 1);
  hero.hurtFlash = Math.max(0, hero.hurtFlash - 1);
  if (hero.comboTimer > 0) {
    hero.comboTimer -= 1;
    if (hero.comboTimer === 0) hero.combo = 0;
  }

  // 格挡：按住生效；攻击与滞空时不能举盾。
  const grounded = hero.y >= TRIAL_GROUND_Y;
  hero.guarding =
    (input & TRIAL_INPUT.guard) !== 0 && hero.attack === null && grounded;

  const left = (input & TRIAL_INPUT.left) !== 0;
  const right = (input & TRIAL_INPUT.right) !== 0;
  hero.moving = left !== right;
  if (hero.moving) {
    const speed = hero.guarding ? HERO_GUARD_SPEED : HERO_SPEED;
    hero.x += left ? -speed : speed;
    hero.facing = left ? -1 : 1;
    hero.x = clamp(hero.x, 30, TRIAL_WORLD_W - 30);
  }

  if ((pressed & TRIAL_INPUT.jump) !== 0 && grounded) {
    hero.vy = HERO_JUMP_V;
  }
  if (!grounded || hero.vy < 0) {
    hero.vy += HERO_GRAVITY;
    hero.y += hero.vy;
    if (hero.y >= TRIAL_GROUND_Y) {
      hero.y = TRIAL_GROUND_Y;
      hero.vy = 0;
    }
  }

  if (state.phase === "explore" && (pressed & TRIAL_INPUT.interact) !== 0) {
    tryInteract(state);
  }

  // 起手：攻击瞬间自动面向最近的敌人；同一时刻只能有一招在演。
  if (hero.attack === null) {
    if ((pressed & TRIAL_INPUT.attack) !== 0) {
      if (state.enemy) hero.facing = state.enemy.x >= hero.x ? 1 : -1;
      hero.attack = { kind: "slash", frame: 0, hit: false };
    } else if ((pressed & TRIAL_INPUT.heavy) !== 0 && hero.cooldownArc === 0) {
      if (state.enemy) hero.facing = state.enemy.x >= hero.x ? 1 : -1;
      hero.attack = { kind: "arc", frame: 0, hit: false };
      const fx = effectsFor(hero.relics);
      hero.cooldownArc = Math.max(60, ARC.cooldown - fx.arcCdCut);
    } else if ((pressed & TRIAL_INPUT.burst) !== 0 && hero.cooldownBurst === 0) {
      hero.attack = { kind: "burst", frame: 0, hit: false };
      const fx = effectsFor(hero.relics);
      hero.cooldownBurst = Math.max(180, BURST.cooldown - fx.burstCdCut);
    }
  }

  if ((pressed & TRIAL_INPUT.potion) !== 0 && hero.potions > 0 && hero.hp < hero.maxHp) {
    hero.potions -= 1;
    healHero(state, TRIAL_POTION_HEAL, hero.x, hero.y - 50);
  }

  if (hero.attack) {
    const attack = hero.attack;
    attack.frame += 1;
    const spec =
      attack.kind === "arc" ? ARC : attack.kind === "burst" ? BURST : SLASH;
    const inWindow = attack.frame >= spec.hitStart && attack.frame <= spec.hitEnd;
    const canHit =
      state.phase === "fight" &&
      !attack.hit &&
      state.enemy !== null &&
      state.enemy.hp > 0 &&
      hero.y >= TRIAL_GROUND_Y - HERO_GROUND_REACH;

    if (inWindow && canHit) {
      const enemy = state.enemy;
      if (enemy) {
        const reachable =
          attack.kind === "burst"
            ? Math.abs(enemy.x - hero.x) <= BURST.radius
            : (() => {
                const ahead = (enemy.x - hero.x) * hero.facing;
                const range = attack.kind === "arc" ? ARC.range : SLASH.range;
                return ahead >= -12 && ahead <= range + 16;
              })();
        if (reachable) {
          attack.hit = true;
          resolveHeroHit(state, attack.kind);
        }
      }
    }
    if (attack.frame >= spec.total) hero.attack = null;
  }

  if (state.phase === "fight") stepEnemy(state);
}

/** 服务端重放：把整串输入帧按 60Hz 跑完，返回最终状态。 */
export function replayTrialGame(dungeon: TrialDungeon, frames: unknown[]): TrialGameState {
  const state = createTrialGame(dungeon);
  const list = Array.isArray(frames) ? frames : [];
  const limit = Math.min(list.length, TRIAL_MAX_FRAMES);
  for (let i = 0; i < limit; i += 1) {
    if (state.phase === "over" || state.phase === "won") break;
    const raw = Number(list[i]);
    const mask = Number.isFinite(raw) ? Math.max(0, Math.min(0xffff, Math.trunc(raw))) : 0;
    stepTrialGame(state, mask);
  }
  return state;
}

export interface TrialDungeonResult {
  status: "playing" | "cleared" | "dead";
  floorsCleared: number;
  totalFloors: number;
  victory: boolean;
  heroHp: number;
  heroMaxHp: number;
  level: number;
  exp: number;
  expToNext: number;
  potions: number;
  relics: TrialRelicId[];
  combo: number;
  kills: number;
  ticks: number;
}

export function trialGameResult(state: TrialGameState): TrialDungeonResult {
  return {
    status: state.phase === "over" ? "dead" : state.phase === "won" ? "cleared" : "playing",
    floorsCleared: Math.min(state.floorIndex, state.dungeon.floors.length),
    totalFloors: state.dungeon.floors.length,
    victory: state.phase === "won",
    heroHp: Math.max(0, state.hero.hp),
    heroMaxHp: state.hero.maxHp,
    level: state.hero.level,
    exp: state.hero.exp,
    expToNext: expToNext(state.hero.level),
    potions: state.hero.potions,
    relics: [...state.hero.relics],
    combo: state.hero.combo,
    kills: state.kills,
    ticks: state.tick,
  };
}

/** 兼容旧调用：按输入帧重放并返回战果（服务端结算用）。 */
export function simulateTrialDungeon(
  dungeon: TrialDungeon,
  frames: unknown[],
): TrialDungeonResult {
  return trialGameResult(replayTrialGame(dungeon, frames));
}
