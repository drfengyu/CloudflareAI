import attackFrameCounts from "./attack-frames.json";
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
  map: { src: string; x: number; y: number; w: number; h: number; scale: number } | null;
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
      const base = s.name.split("#")[0];
      const list = scenesByName.get(base) ?? [];
      list.push(s);
      scenesByName.set(base, list);
    }
    return { content, scenes, lua, palettes, characters, equipment, items, skills, formations, battles, scenesByName, hpLevels };
  })();
  return cached;
}

export const CHAPTER_NAMES = ["第一章", "第二章", "第三章", "第四章", "第五章", "第六章", "第七章", "第八章"];

export function chapterName(id: number) {
  return CHAPTER_NAMES[Math.max(0, Math.min(7, id - 1))] ?? `第${id}章`;
}

export function hpFor(data: CharacterData | undefined, hpLevels: Map<string, HpLevelData>, lv: number) {
  const level = hpLevels.get(data?.hpLevel ?? "") ?? hpLevels.get("备良琦");
  if (!level) return 100 + lv * 18;
  let hp = level.lv1;
  const tens = Math.floor((lv - 1) / 10);
  for (let i = 0; i < Math.min(tens, level.deltas.length); i++) hp += level.deltas[i];
  if (lv > 1) {
    const rem = (lv - 1) % 10;
    const idx = Math.min(tens, level.deltas.length - 1);
    hp += (level.deltas[idx] / 10) * rem;
  }
  return Math.round(hp);
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

export function faceForProfile(profile: string | null | undefined) {
  if (!profile) return null;
  const pinyin: Record<string, string> = {
    刘备: "liubei", 关羽: "guanyu", 张飞: "zhangfei", 诸葛亮: "zhugeliang", 曹操: "caocao",
    赵云: "zhaoyun", 孙权: "sunquan", 周瑜: "zhouyu", 吕布: "lvbu", 董卓: "dongzhuo",
  };
  if (pinyin[profile]) return `/game-assets/kongming/portraits/${pinyin[profile]}.gif`;
  return `/game-assets/kongming/faces/${profile}.png`;
}
