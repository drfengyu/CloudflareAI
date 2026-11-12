/**
 * 每日试炼·浮游城攻略（纯函数，客户端与服务端共用）。
 *
 * 一局 = 逐层向上的塔：每层先在两扇「野区门」里选一条探路（战斗 / 精英 /
 * 宝箱 / 营地），然后挑战层主；击败层主才进入下一层。生命跨房间保留，
 * 击杀获得经验并升级（提升生命上限），剑技有冷却、连击会加伤，
 * 层主残血进入狂暴。
 *
 * 地图、圣物位置与伤害浮动都由种子决定；客户端本地演算做动画，交卷时服务端
 * 用同一份动作序列重算，结果完全一致，因此不需要信任浏览器上报的血量。
 */

export const TRIAL_MAX_FLOORS = 7;

export const TRIAL_HERO_MAX_HP = 100;
export const TRIAL_LEVEL_HP = 10;
export const TRIAL_ROOM_HEAL = 6;
export const TRIAL_REST_HEAL = 28;
export const TRIAL_POTION_COUNT = 2;
export const TRIAL_POTION_HEAL = 32;
export const TRIAL_ENRAGE_RATIO = 0.4;

export const TRIAL_SLASH = { min: 12, max: 16 } as const;
export const TRIAL_ARC = { min: 19, max: 24, cooldown: 2 } as const;
export const TRIAL_GUARD = { block: 14, heal: 4 } as const;
export const TRIAL_BURST = { min: 30, max: 38, cooldown: 4 } as const;

export type TrialSkillId = "slash" | "arc" | "guard" | "burst";

export interface TrialSkillMeta {
  id: TrialSkillId;
  name: string;
  desc: string;
  cooldown: number;
}

export const TRIAL_SKILLS: TrialSkillMeta[] = [
  { id: "slash", name: "线性攻击", desc: `造成 ${TRIAL_SLASH.min}~${TRIAL_SLASH.max} 伤害`, cooldown: 0 },
  {
    id: "arc",
    name: "水平弧斩",
    desc: `造成 ${TRIAL_ARC.min}~${TRIAL_ARC.max} 伤害，冷却 ${TRIAL_ARC.cooldown} 回合`,
    cooldown: TRIAL_ARC.cooldown,
  },
  {
    id: "guard",
    name: "切换防守",
    desc: `本回合格挡 ${TRIAL_GUARD.block} 伤害并回复 ${TRIAL_GUARD.heal} 生命`,
    cooldown: 0,
  },
  {
    id: "burst",
    name: "星屑飞溅",
    desc: `造成 ${TRIAL_BURST.min}~${TRIAL_BURST.max} 伤害，冷却 ${TRIAL_BURST.cooldown} 回合`,
    cooldown: TRIAL_BURST.cooldown,
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
  whetstone: { id: "whetstone", name: "锐刃", desc: "线性攻击伤害 +3" },
  ironbark: { id: "ironbark", name: "翠绿护腕", desc: "切换防守格挡 +5" },
  starcore: { id: "starcore", name: "迅捷之靴", desc: "剑技冷却 -1（最低 1）" },
  bloodpact: { id: "bloodpact", name: "生命结晶", desc: "生命上限 +15，立即回复 15" },
  leech: { id: "leech", name: "吸魂戒指", desc: "清空房间额外回复 6 生命" },
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
  version: 4;
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

const int = (random: () => number, min: number, max: number): number =>
  min + Math.floor(random() * (max - min + 1));

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

  return { version: 4, seed, heroHp: TRIAL_HERO_MAX_HP, floors };
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

/** 旧版对局（答题题库 / 单排波次 / 旧地下城）版本号不同，交给调用方清理。 */
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
  if (it.version !== 4 || !Array.isArray(it.floors) || it.floors.length === 0) return null;

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
    version: 4,
    seed: Number.isFinite(Number(it.seed)) ? Number(it.seed) >>> 0 : 0,
    heroHp: Math.max(1, Math.trunc(Number(it.heroHp) || TRIAL_HERO_MAX_HP)),
    floors,
  };
}

export type TrialAction =
  | { t: "enter"; i: number }
  | { t: "boss" }
  | { t: "skill"; s: TrialSkillId }
  | { t: "item" };

export interface TrialTurn {
  /** 1-based 层数。 */
  floor: number;
  roomName: string;
  action: TrialSkillId | "item";
  intent: TrialIntent | "heavy";
  dealt: number;
  taken: number;
  blocked: number;
  healed: number;
  heroHp: number;
  monsterHp: number;
  monsterMaxHp: number;
  monsterShield: number;
  roomCleared: boolean;
  heroDown: boolean;
  combo: number;
  enraged: boolean;
}

export interface TrialRoomEvent {
  floor: number;
  kind: TrialRoomKind | "boss";
  title: string;
  relic?: TrialRelicId;
  healed: number;
  xp: number;
}

export interface TrialCurrentRoom {
  room: TrialRoom;
  boss: boolean;
  monsterHp: number;
  monsterMaxHp: number;
  monsterShield: number;
  nextIntent: TrialIntent | "heavy" | null;
  enraged: boolean;
}

export interface TrialDungeonResult {
  floorsCleared: number;
  totalFloors: number;
  floorIndex: number;
  fieldCleared: boolean;
  heroHp: number;
  heroMaxHp: number;
  level: number;
  exp: number;
  expToNext: number;
  potions: number;
  combo: number;
  relics: TrialRelicId[];
  victory: boolean;
  turns: number;
  status: "choosing" | "fighting" | "cleared" | "dead";
  cooldowns: { arc: number; burst: number };
  current: TrialCurrentRoom | null;
  lastTurn: TrialTurn | null;
  events: TrialRoomEvent[];
  log: TrialTurn[];
}

const MAX_ACTIONS = 600;

function normalizeSkill(value: unknown): TrialSkillId {
  return value === "guard" || value === "arc" || value === "burst" ? value : "slash";
}

/** 升到下一级所需经验。 */
export function expToNext(level: number): number {
  return 40 + Math.max(0, level - 1) * 20;
}

interface RelicEffects {
  slashBonus: number;
  guardBonus: number;
  burstBonus: number;
  cdReduction: number;
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
    cdReduction: count("starcore"),
    maxHpBonus: 15 * count("bloodpact"),
    killHeal: 6 * count("leech"),
    pierce: 6 * count("piercer"),
    entryHeal: 4 * count("lantern"),
  };
}

function xpForRoom(kind: TrialRoomKind | "boss", floorIndex: number): number {
  if (kind === "boss") return 45 + floorIndex * 8;
  if (kind === "elite") return 28 + floorIndex * 5;
  if (kind === "fight") return 14 + floorIndex * 3;
  return 0;
}

/**
 * 按动作序列走完整座塔。非法动作兜底为「斩击」或「第一扇门」，
 * 死亡 / 通关后的动作忽略，因此客户端只要按顺序交上点击记录即可。
 */
export function simulateTrialDungeon(
  dungeon: TrialDungeon,
  actions: unknown[],
): TrialDungeonResult {
  const random = mulberry32((dungeon.seed ^ 0x9e3779b9) >>> 0);
  const log: TrialTurn[] = [];
  const events: TrialRoomEvent[] = [];
  let relics: TrialRelicId[] = [];
  let fx = effectsFor(relics);
  let maxHp = dungeon.heroHp;
  let heroHp = maxHp;
  let level = 1;
  let exp = 0;
  let potions = TRIAL_POTION_COUNT;
  let combo = 0;
  let floorIndex = 0;
  let fieldCleared = false;
  let turnInRoom = 0;
  let cdArc = 0;
  let cdBurst = 0;
  type CombatState = {
    room: TrialRoom;
    boss: boolean;
    monsterHp: number;
    monsterShield: number;
    charged: boolean;
  };
  let current: CombatState | null = null;

  const lastEvent = () => events[events.length - 1] ?? null;

  const grantXp = (amount: number) => {
    exp += amount;
    while (exp >= expToNext(level)) {
      exp -= expToNext(level);
      level += 1;
      maxHp += TRIAL_LEVEL_HP;
      heroHp = Math.min(maxHp, heroHp + TRIAL_LEVEL_HP);
    }
  };

  const grantRelic = (relic: TrialRelicId) => {
    relics = [...relics, relic];
    fx = effectsFor(relics);
    const nextMax = dungeon.heroHp + fx.maxHpBonus + (level - 1) * TRIAL_LEVEL_HP;
    const gained = Math.max(0, nextMax - maxHp);
    maxHp = nextMax;
    let healed = gained;
    if (relic === "bloodpact") {
      healed += Math.min(15, Math.max(0, maxHp - heroHp - healed));
    }
    healed = Math.min(healed, Math.max(0, maxHp - heroHp));
    heroHp += healed;
    const event = lastEvent();
    if (event) {
      event.relic = relic;
      event.healed += healed;
    }
  };

  const intentAt = (wave: TrialWave, turn: number, charged: boolean): TrialIntent | "heavy" => {
    const base = wave.pattern[turn % wave.pattern.length];
    return base === "attack" && charged ? "heavy" : base;
  };

  const enterRoom = (room: TrialRoom, boss: boolean): CombatState | null => {
    events.push({
      floor: floorIndex + 1,
      kind: boss ? "boss" : room.kind,
      title: boss ? room.wave?.name ?? "层主" : room.title,
      healed: 0,
      xp: 0,
    });
    turnInRoom = 0;
    combo = 0;

    if (room.relic && room.kind === "treasure") grantRelic(room.relic);

    const entryHeal = Math.min(fx.entryHeal, Math.max(0, maxHp - heroHp));
    if (entryHeal > 0) {
      heroHp += entryHeal;
      const event = lastEvent();
      if (event) event.healed += entryHeal;
    }

    if (room.kind === "rest") {
      const healed = Math.min(TRIAL_REST_HEAL, Math.max(0, maxHp - heroHp));
      heroHp += healed;
      const event = lastEvent();
      if (event) event.healed += healed;
      fieldCleared = true;
      return null;
    }
    if (room.kind === "treasure" || !room.wave) {
      fieldCleared = true;
      return null;
    }
    return { room, boss, monsterHp: room.wave.hp, monsterShield: 0, charged: false };
  };

  for (const raw of actions.slice(0, MAX_ACTIONS)) {
    if (heroHp <= 0 || floorIndex >= dungeon.floors.length) break;
    const floor = dungeon.floors[floorIndex];
    const action = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

    if (!current) {
      if (action.t === "boss") {
        current = enterRoom(floor.boss, true);
        continue;
      }
      if (action.t === "enter" && !fieldCleared) {
        const index = Math.min(
          floor.rooms.length - 1,
          Math.max(0, Math.trunc(Number(action.i) || 0)),
        );
        current = enterRoom(floor.rooms[index], false);
      }
      continue;
    }

    const wave = current.room.wave;
    if (!wave) break;
    const isItem = action.t === "item";
    if (!isItem && action.t !== "skill") continue;
    const skill = isItem ? null : normalizeSkill(action.s);
    if (isItem && potions <= 0) continue;

    const intent = intentAt(wave, turnInRoom, current.charged);
    const enraged = wave.enrage === true && current.monsterHp <= wave.hp * TRIAL_ENRAGE_RATIO;

    let dealt = 0;
    let healed = 0;
    let block = 0;
    if (isItem) {
      potions -= 1;
      healed = Math.min(TRIAL_POTION_HEAL, Math.max(0, maxHp - heroHp));
      heroHp += healed;
    } else if (skill === "guard") {
      combo = 0;
      block = TRIAL_GUARD.block + fx.guardBonus;
      healed = Math.min(TRIAL_GUARD.heal, Math.max(0, maxHp - heroHp));
      heroHp += healed;
    } else {
      const comboBonus = Math.min(10, combo * 2);
      if (skill === "arc" && cdArc === 0) {
        dealt = int(random, TRIAL_ARC.min + comboBonus, TRIAL_ARC.max + comboBonus);
        cdArc = Math.max(1, TRIAL_ARC.cooldown - fx.cdReduction);
      } else if (skill === "burst" && cdBurst === 0) {
        dealt = int(
          random,
          TRIAL_BURST.min + fx.burstBonus + comboBonus,
          TRIAL_BURST.max + fx.burstBonus + comboBonus,
        );
        cdBurst = Math.max(1, TRIAL_BURST.cooldown - fx.cdReduction);
      } else {
        dealt = int(
          random,
          TRIAL_SLASH.min + fx.slashBonus + comboBonus,
          TRIAL_SLASH.max + fx.slashBonus + comboBonus,
        );
      }
      combo += 1;
    }

    if (dealt > 0) {
      const afterPierce = Math.max(0, dealt - fx.pierce);
      const absorbed = Math.min(current.monsterShield, afterPierce);
      current.monsterShield -= absorbed;
      dealt -= absorbed;
      current.monsterHp -= dealt;
    }

    if (current.monsterHp <= 0) {
      const cleared = current;
      const remainingShield = cleared.monsterShield;
      current = null;
      if (cleared.room.relic && cleared.room.kind === "elite") grantRelic(cleared.room.relic);
      const clearHeal = Math.min(TRIAL_ROOM_HEAL + fx.killHeal, Math.max(0, maxHp - heroHp));
      heroHp += clearHeal;
      healed += clearHeal;
      const xp = xpForRoom(cleared.boss ? "boss" : cleared.room.kind, floorIndex);
      grantXp(xp);
      const event = lastEvent();
      if (event) event.xp += xp;
      if (cleared.boss) {
        floorIndex += 1;
        fieldCleared = false;
      } else {
        fieldCleared = true;
      }
      log.push({
        floor: cleared.boss ? floorIndex : floorIndex + 1,
        roomName: cleared.boss ? cleared.room.wave?.name ?? "层主" : cleared.room.title,
        action: isItem ? "item" : (skill as TrialSkillId),
        intent,
        dealt,
        taken: 0,
        blocked: 0,
        healed,
        heroHp,
        monsterHp: 0,
        monsterMaxHp: wave.hp,
        monsterShield: remainingShield,
        roomCleared: true,
        heroDown: false,
        combo,
        enraged,
      });
      continue;
    }

    let taken = 0;
    let blocked = 0;
    if (intent === "guard") {
      current.monsterShield += 12;
    } else if (intent === "charge") {
      current.charged = true;
    } else {
      const baseDamage = wave.atk * (intent === "heavy" ? 2.2 : 1);
      const rawDamage = Math.round(baseDamage * (enraged ? 1.35 : 1));
      blocked = Math.min(block, rawDamage);
      taken = rawDamage - blocked;
      current.charged = false;
      heroHp -= taken;
      if (taken > 0) combo = 0;
    }

    cdArc = Math.max(0, cdArc - 1);
    cdBurst = Math.max(0, cdBurst - 1);
    turnInRoom += 1;
    log.push({
      floor: floorIndex + 1,
      roomName: current.boss ? current.room.wave?.name ?? "层主" : current.room.title,
      action: isItem ? "item" : (skill as TrialSkillId),
      intent,
      dealt,
      taken,
      blocked,
      healed,
      heroHp: Math.max(0, heroHp),
      monsterHp: Math.max(0, current.monsterHp),
      monsterMaxHp: wave.hp,
      monsterShield: current.monsterShield,
      roomCleared: false,
      heroDown: heroHp <= 0,
      combo,
      enraged,
    });
    if (heroHp <= 0) break;
  }

  const floorsCleared = Math.min(floorIndex, dungeon.floors.length);
  const victory = floorsCleared >= dungeon.floors.length;
  const status: TrialDungeonResult["status"] =
    heroHp <= 0 ? "dead" : victory ? "cleared" : current ? "fighting" : "choosing";
  const nextIntent =
    current && current.room.wave
      ? intentAt(current.room.wave, turnInRoom, current.charged)
      : null;
  const enraged = Boolean(
    current &&
      current.room.wave?.enrage === true &&
      current.monsterHp <= current.room.wave.hp * TRIAL_ENRAGE_RATIO,
  );

  return {
    floorsCleared,
    totalFloors: dungeon.floors.length,
    floorIndex: Math.min(floorIndex, dungeon.floors.length),
    fieldCleared,
    heroHp: Math.max(0, heroHp),
    heroMaxHp: maxHp,
    level,
    exp,
    expToNext: expToNext(level),
    potions,
    combo,
    relics,
    victory,
    turns: log.length,
    status,
    cooldowns: { arc: cdArc, burst: cdBurst },
    current: current
      ? {
          room: current.room,
          boss: current.boss,
          monsterHp: Math.max(0, current.monsterHp),
          monsterMaxHp: current.room.wave?.hp ?? 0,
          monsterShield: current.monsterShield,
          nextIntent,
          enraged,
        }
      : null,
    lastTurn: log.length > 0 ? log[log.length - 1] : null,
    events,
    log,
  };
}
