import attackFrameCounts from "./attack-frames.json";
import battleSpriteData from "./battle-sprites.json";
import npcMotionData from "./npc-motion.json";
import shopNpcData from "./shop-npcs.json";
import { installCouponRoom } from "./coupon-room";

export interface CharacterData {
  id: number;
  name: string;
  style: string;
  source: string;
  critRate: number;
  critPower: number;
  fixedHp: number;
  weapon: number;
  terrain: number;
  readyX: number;
  stats: number[]; // Hp, Mp, Atk, Def, Str, Ler, Spd
  hpLevel: string | null;
  skills: string[];
  profile: string | null;
  modelTexture: string | null;
}

export interface ModelPalette {
  first: number[];
  second: number[];
  use3?: boolean;
  three?: number[];
  name?: string;
  texture?: string;
}

export interface EquipmentData {
  id: number;
  name: string;
  equipType: number;
  attackCount: number;
  weaponType: number;
  stats: number[];
  description: string;
  price: number;
}

export interface ItemData {
  id: number;
  name: string;
  cost: number;
  costPercent: number;
  damageCoef: number;
  damageType: number;
  valueType: number;
  useScope: number;
  targetScope: number;
  heal: boolean;
  resurrect: boolean;
  text: string;
  description: string;
  price: number;
}

export interface SkillData {
  id: number;
  name: string;
  skillName: string;
  lv: number;
  cost: number;
  hitRate: number;
  damageCoef: number;
  damageType: number;
  valueType: number;
  property: number;
  useScope: number;
  targetScope: number;
  heal: boolean;
  resurrect: boolean;
  text: string;
  normalText: string;
  buffs: unknown[];
}

export interface BattleData {
  name: string;
  type: number;
  terrain: number;
  property: number;
  cityDef: number;
  hasCityDef: boolean;
  money: number;
  exp: number;
  startAttack: number;
  formation: string;
  enemies: string[];
  random: boolean;
  randomNum: number;
  auto: boolean;
  scripts: string[];
}

export interface FormationData {
  id: number;
  name: string;
  formationName: string;
  cost: number;
  useScope: number;
  useTerrain: number;
  positions: { OriginPos: number }[];
  flatMags: { attack: number; getHurt: number; buffs: unknown[] }[];
  nonFlatMags?: unknown;
}

export interface ChapterData {
  id: number;
  order: string;
  name: string;
  hpList: number[];
  str: number;
  ler: number;
  spd: number;
  attack: number;
  defense: number;
  exp: number;
  money: number;
  solidRatio: number;
  changeTo: string;
  stay: string[];
  generals: string[];
}

export interface HpLevelData {
  name: string;
  lv1: number;
  deltas: number[];
}

export interface StartConfig {
  characters: string[];
  npcCharacters: string[];
  alternateCharacters: string[];
  adviserIndex: number;
  lv: number;
  maxMp: number;
  exp: number;
  money: number;
  meetEnemyRatio: number;
  defaultFormation: string;
  inventory: { slots: { item: string; count: number }[] };
  formations: string[];
}

export interface EnemyStat {
  name: string;
  tag: string;
  maxHp: number;
  hp: number;
  maxMp: number;
  atk: number;
  def: number;
  character: string | null;
  model: string | null;
  enemySkills: string | null;
  award: string | null;
  skills: (string | null)[];
}

export interface Content {
  characters: CharacterData[];
  battles: BattleData[];
  enemyStats?: Record<string, (EnemyStat | null)[]>;
  equipment: EquipmentData[];
  items: ItemData[];
  shops: { name: string; items: string[] }[];
  parameters?: Record<string, Record<string, string[]>>;
  chapters: ChapterData[];
  skills: SkillData[];
  formations: FormationData[];
  exp: { levels: { exp: number; next: number; skills: string[]; formations: string[] }[] };
  hpLevels: HpLevelData[];
  awards: { name: string; money: number; exp: number; items: (string | null)[] }[];
  start: StartConfig;
}

export interface SceneEvent {
  id: string;
  when: number;
  pos: [number, number];
  go: number;
  params: number[];
  names: { name: string; profile: string }[];
  show: string;
  hide: string;
  chapter: string | null;
  battles: string[];
  startHide: boolean;
  hideAfter: boolean;
  model?: string | null;
}

export interface Scene {
  level: number;
  id: string;
  name: string;
  /** `SceneData.sceneName` 的旧名字；改版包里部分场景名被复用过，保留给旧传送点兼容。 */
  legacyName?: string;
  /** `fg` 是原版 `Foreground` 图层单独导出的透明覆盖层，画在角色之上。 */
  map: { src: string; fg?: string; x: number; y: number; w: number; h: number; scale: number } | null;
  blockedMask: string | null;
  boxes: number[][];
  events: SceneEvent[];
  npcs: { pos: [number, number]; name: string; profile: string; model: string | null }[];
  transitions: { pos: [number, number]; type: number; scene: string; tag: string; destTag: number; when: number }[];
  destinations: { pos: [number, number]; tag: string; destTag: number }[];
  chests: { id: string; pos: [number, number]; money: number; items: { name: string; count: number }[]; show: boolean; refresh: boolean }[];
  start: [number, number] | null;
  previous: string;
  isWorld: boolean;
  isCave: boolean;
  terrain: number;
  hasBoat: boolean;
}

export interface GameData {
  content: Content;
  scenes: Scene[];
  lua: Record<string, string>;
  characters: Map<string, CharacterData>;
  palettes: Map<string, ModelPalette>;
  equipment: Map<string, EquipmentData>;
  items: Map<string, ItemData>;
  skills: Map<string, SkillData>;
  formations: Map<string, FormationData>;
  battles: Map<string, BattleData>;
  scenesByName: Map<string, Scene[]>;
  hpLevels: Map<string, HpLevelData>;
}

let cached: Promise<GameData> | null = null;

export function loadGameData(): Promise<GameData> {
  if (cached) return cached;
  cached = (async () => {
    const [content, sceneList, lua, palettesRaw] = await Promise.all([
      fetch("/game-assets/kongming/content.json").then((r) => r.json() as Promise<Content>),
      fetch("/game-assets/kongming/scenes.json").then((r) => r.json() as Promise<Scene[]>),
      fetch("/game-assets/kongming/lua.json").then((r) => r.json() as Promise<Record<string, string>>),
      fetch("/game-assets/kongming/palettes.json").then((r) => r.json() as Promise<Record<string, ModelPalette>>),
    ]);
    const scenes = installCouponRoom(sceneList);
    const palettes = new Map(Object.entries(palettesRaw));
    const characters = new Map<string, CharacterData>();
    for (const s of scenes) {
      if (s.map?.src?.startsWith("/kongming/")) {
        s.map.src = s.map.src.replace("/kongming/", "/game-assets/kongming/");
      }
    }
    for (const c of content.characters) if (c.name && !characters.has(c.name)) characters.set(c.name, c);
    // Later entries from sharedassets0 win (they contain the playable leader data).
    for (const c of content.characters) if (c.name) characters.set(c.name, c);
    const equipment = new Map(content.equipment.map((e) => [e.name, e]));
    const items = new Map(content.items.map((i) => [i.name, i]));
    const skills = new Map(content.skills.map((s) => [s.name, s]));
    const formations = new Map(content.formations.map((f) => [f.name, f]));
    const battles = new Map(content.battles.map((b) => [b.name, b]));
    const hpLevels = new Map(content.hpLevels.map((h) => [h.name, h]));
    const scenesByName = new Map<string, Scene[]>();
    for (const s of scenes) {
      for (const key of [s.name, s.legacyName]) {
        if (!key) continue;
        const base = key.split("#")[0];
        const list = scenesByName.get(base) ?? [];
        if (!list.includes(s)) list.push(s);
        scenesByName.set(base, list);
      }
    }
    return { content, scenes, lua, palettes, characters, equipment, items, skills, formations, battles, scenesByName, hpLevels };
  })();
  return cached;
}

export const CHAPTER_NAMES = ["第一章", "第二章", "第三章", "第四章", "第五章", "第六章", "第七章", "第八章"];

export function chapterName(id: number) {
  return CHAPTER_NAMES[Math.max(0, Math.min(7, id - 1))] ?? `第${id}章`;
}

/**
 * 桌面版 `HpLevelData.Level(lv)` 的原样实现：
 *
 *     num  = lv1 - deltas[0]
 *     num2 = lv / 10
 *     num3 = lv % 10
 *     for i in 0..num2-1: num += 10 * deltas[i]
 *     return num + num3 * deltas[num2]
 *
 * 不是「每 10 级加一次 delta」的近似版。1 级 = lv1；2–10 级每级涨
 * deltas[0]，11 级起换 deltas[1]，以此类推。没有 `hpLevel` 的角色沿用
 * `Character.fixedHp`（普通敌将为 0，战斗里由章节数值接管）。
 */
export function hpFor(data: CharacterData | undefined, hpLevels: Map<string, HpLevelData>, lv: number) {
  const levelData = hpLevels.get(data?.hpLevel ?? "");
  if (!levelData) return Math.max(0, data?.fixedHp ?? 0);
  const level = Math.max(1, Math.trunc(lv));
  const deltas = levelData.deltas;
  const tens = Math.floor(level / 10);
  let hp = levelData.lv1 - deltas[0];
  for (let i = 0; i < tens; i++) {
    hp += 10 * (deltas[Math.min(i, deltas.length - 1)] ?? 0);
  }
  const rem = level % 10;
  hp += rem * (deltas[Math.min(tens, deltas.length - 1)] ?? 0);
  return Math.max(0, Math.round(hp));
}

export function equipmentSlot(name: string): number {
  if (/盾/.test(name)) return 3;
  if (/马/.test(name)) return 4;
  if (/盔|帽|头带|冠|巾/.test(name)) return 2;
  if (/甲|衣|袍|铠/.test(name)) return 1;
  return 0;
}

export function priceOf(data: GameData, name: string) {
  return data.equipment.get(name)?.price ?? data.items.get(name)?.price ?? 0;
}

export function spriteForModel(model: string | null | undefined) {
  return model ? `/game-assets/kongming/units_field/${model}.png` : null;
}

const battleSpriteSets = battleSpriteData as { ready: string[]; dead: string[] };
const battleReadyModels = new Set(battleSpriteSets.ready);
const battleDeadModels = new Set(battleSpriteSets.dead);

/** 原版 `BattleReadySprite`：`MoveSprites[readyX, 3]`，行 3 朝右，共两帧。 */
export function battleReadyFrameForModel(
  model: string | null | undefined,
  frame: number,
) {
  if (!model || !battleReadyModels.has(model)) return null;
  return `/game-assets/kongming/units_battle/${model}-${frame % 2}.png`;
}

/** 原版 `DeadSprite`：`Rect(360, 0, 64, 64)`，单独导出为 64×64。 */
export function deathSpriteForModel(model: string | null | undefined) {
  if (!model || !battleDeadModels.has(model)) return null;
  return `/game-assets/kongming/units_dead/${model}.png`;
}

/**
 * 按等级累计原版升级表里已习得的计策/阵形。
 * `exp.levels` 第 N 行是升到 N 级时习得的内容；1 级行通常为空。
 */
export function learnedAtLevel(content: Content, level: number) {
  const rows = content.exp.levels.slice(0, Math.max(0, Math.min(level, content.exp.levels.length)));
  const skills: string[] = [];
  const formations: string[] = [];
  for (const row of rows) {
    skills.push(...row.skills);
    formations.push(...row.formations);
  }
  return {
    skills: skills.filter((name, i) => skills.indexOf(name) === i),
    formations: formations.filter((name, i) => formations.indexOf(name) === i),
  };
}

/** 阵形菜单只列出已习得阵形；当前正在使用的阵形始终保留。 */
export function learnedFormationsAtLevel(
  content: Content,
  level: number,
  current?: string | null,
) {
  const learned = new Set(learnedAtLevel(content, level).formations);
  if (current) learned.add(current);
  return content.start.formations.filter((name) => learned.has(name));
}

export function walkStripForModel(model: string | null | undefined) {
  return model ? `/game-assets/kongming/units_field_walk/${model}.png` : null;
}

/** 桌面版 `NPC.MoveSprites` 的漫游参数，按场景 + 事件 id 索引。 */
export interface NpcMotion {
  speed: number;
  wait: number;
  area: [number, number];
  dirs: number[];
  base: [number, number];
  /** 具名武将复用 Character 模型条带。 */
  model?: string;
  /** 通用 NPC 的 8 帧条带名（`npc_walk/<strip>.png`）。 */
  strip?: string;
}

export function npcMotionFor(
  level: number | null | undefined,
  eventId: string | null | undefined,
): NpcMotion | null {
  if (level == null || !eventId) return null;
  const table = npcMotionData as unknown as Record<string, Record<string, NpcMotion>>;
  return table[String(level)]?.[eventId] ?? null;
}

export function npcWalkStripFor(motion: NpcMotion | null): string | null {
  if (!motion) return null;
  if (motion.strip) return `/game-assets/kongming/npc_walk/${motion.strip}.png`;
  return walkStripForModel(motion.model);
}

export interface ShopNpc {
  image: string;
  pos: [number, number];
  name: string;
  /** 店主对应的场景事件 id；只对该事件绘制店主，避免同场景其他事件被顶替。 */
  event: string;
}

/** 桌面版店铺里独立的店主 GameObject（老板/老板娘），按场景 level 取。 */
export function shopNpcFor(level: number | null | undefined): ShopNpc | null {
  if (level == null) return null;
  const table = shopNpcData as unknown as Record<string, ShopNpc>;
  return table[String(level)] ?? null;
}

/**
 * 桌面版 `Character.AttackSprites` 的帧序：贴图从 x=424 起每 64px 一帧，
 * 2 帧时按 [1,0] 播放；3 帧时原版逐个 Insert 再 Reverse，实际为 [2,0,1]。
 * 没有攻击帧的模型（48/60px 的小图）退回待机动作。
 */
export function attackSequenceForModel(model: string | null | undefined): number[] {
  if (!model) return [];
  const count = (attackFrameCounts as Record<string, number>)[model] ?? 0;
  if (count <= 0) return [];
  if (count === 1) return [0];
  if (count === 2) return [1, 0];
  const order = [count - 1];
  for (let i = 0; i < count - 1; i++) order.push(i);
  return order;
}

export function attackFrameForModel(
  model: string | null | undefined,
  frame: number,
) {
  return model && frame >= 0
    ? `/game-assets/kongming/units_attack/${model}-${frame}.png`
    : null;
}

/** 桌面版店铺事件自带的 48×48 店主头像，与武将立绘分开导出。 */
const SHOP_FACE_PROFILES = new Set(["蔡", "武器店老板", "费诗", "陈宫（2）", "蒋琬"]);

export function shopFaceForProfile(profile: string | null | undefined) {
  if (!profile || !SHOP_FACE_PROFILES.has(profile)) return null;
  return `/game-assets/kongming/shopfaces/${profile}.png`;
}

export function faceForProfile(profile: string | null | undefined) {
  if (!profile) return null;
  const pinyin: Record<string, string> = {
    刘备: "liubei", 关羽: "guanyu", 张飞: "zhangfei", 诸葛亮: "zhugeliang", 曹操: "caocao",
    赵云: "zhaoyun", 孙权: "sunquan", 周瑜: "zhouyu", 吕布: "lvbu", 董卓: "dongzhuo",
  };
  if (pinyin[profile]) return `/game-assets/kongming/portraits/${pinyin[profile]}.gif`;
  return `/game-assets/kongming/faces/${profile}.png`;
}
