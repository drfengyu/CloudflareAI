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

export interface Content {
  characters: CharacterData[];
  battles: BattleData[];
  equipment: EquipmentData[];
  items: ItemData[];
  shops: { name: string; items: string[] }[];
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
    const [content, scenes, lua] = await Promise.all([
      fetch("/game-assets/kongming/content.json").then((r) => r.json() as Promise<Content>),
      fetch("/game-assets/kongming/scenes.json").then((r) => r.json() as Promise<Scene[]>),
      fetch("/game-assets/kongming/lua.json").then((r) => r.json() as Promise<Record<string, string>>),
    ]);
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
    return { content, scenes, lua, characters, equipment, items, skills, formations, battles, scenesByName, hpLevels };
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
  return model ? `/game-assets/kongming/units/${model}.png` : null;
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
