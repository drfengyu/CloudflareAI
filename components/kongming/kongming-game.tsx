"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  CHAPTER_NAMES,
  attackFrameForModel,
  attackSequenceForModel,
  battleReadyFrameForModel,
  chapterName,
  deathSpriteForModel,
  equipmentSlot,
  faceForProfile,
  hpFor,
  learnedAtLevel,
  learnedFormationsAtLevel,
  loadGameData,
  npcMotionFor,
  npcWalkStripFor,
  shopFaceForProfile,
  shopNpcFor,
  spriteForModel,
  walkStripForModel,
  type ChapterData,
  type CharacterData,
  type Content,
  type EquipmentData,
  type FormationData,
  type GameData,
  type ItemData,
  type ModelPalette,
  type Scene,
  type SceneEvent,
  type SkillData,
} from "@/lib/kongming/data";
import { LuaRuntime } from "@/lib/kongming/lua";
import { COUPON_EVENT_ID } from "@/lib/kongming/coupon-room";
import type {
  KongmingCouponGoldOffer,
  KongmingGoldTcrOffer,
} from "@/lib/kongming/activity-config";
import {
  exchangeKongmingGoldForTcrAction,
  redeemKongmingGoldAction,
} from "@/app/kongming/actions";
import type { ActivityCouponView } from "@/lib/activity/coupons";
import { KongmingCouponPanel } from "./kongming-coupon-panel";
import { gameAudio } from "@/lib/game/audio";
import { SoundToggle } from "@/components/activity/sound-toggle";
import { TintedSprite, TintedSvgSprite } from "./tinted-sprite";
import styles from "./kongming-game.module.css";

type Screen = "loading" | "title" | "prologue" | "field" | "battle" | "gameover";

/**
 * 原版 level3 的 Water Tilemap 有 4 帧。这里只渲染这层水，不和整张大图
 * 一起重绘；网页按 0.8 秒一帧循环，避免 4fps 的机械闪烁。
 */
function WaterOverlay({
  src, x, y, width, height,
}: { src: string; x: number; y: number; width: number; height: number }) {
  const [frame, setFrame] = useState(0);
  const water = src.endsWith("level3.png");
  useEffect(() => {
    if (!water) return;
    const timer = window.setInterval(() => setFrame((prev) => (prev + 1) % 4), 800);
    return () => window.clearInterval(timer);
  }, [water]);
  if (!water) return null;
  return (
    <image
      href={`${src.slice(0, -4)}-water-${frame}.png`}
      x={x}
      y={y}
      width={width}
      height={height}
      className={styles.pixel}
      preserveAspectRatio="none"
      pointerEvents="none"
    />
  );
}

interface Member {
  key: string;
  name: string;
  id: number;
  profile: string;
  model: string | null;
  level: number;
  hp: number;
  maxHp: number;
  equipment: Record<number, string | null>;
  skills: string[];
  dead: boolean;
}

interface InventorySlot {
  name: string;
  count: number;
}

type PanelKind =
  | "root"
  | "generals"
  | "party"
  | "inventory"
  | "equipment"
  | "skills"
  | "formations"
  | "save"
  | "load"
  | "settings"
  | "story";

/** 军帐根菜单顺序；末尾“返回”不占 PanelKind。 */
const ROOT_ITEMS: PanelKind[] = [
  "generals",
  "party",
  "equipment",
  "inventory",
  "skills",
  "formations",
  "story",
  "save",
  "settings",
];

interface PanelState {
  kind: PanelKind;
  cursor: number;
  member?: number;
  stage?: "member" | "item";
}

interface DialogueState {
  name: string;
  profile: string | null;
  text: string;
  ask: boolean;
  choice: number;
}

interface BattleUnit {
  key: string;
  side: "player" | "enemy";
  name: string;
  profile: string | null;
  model: string | null;
  hp: number;
  maxHp: number;
  str: number;
  ler: number;
  spd: number;
  atk: number;
  def: number;
  mp: number;
  weaponBits: number;
  terrainBits: number;
  skills: string[];
  defending: boolean;
  attackTimes: number;
  hitRate: number;
  critRate: number;
  critPower: number;
}

interface NpcWalkState {
  x: number;
  y: number;
  dir: [number, number];
  wait: number;
  move?: { tx: number; ty: number; progress: number };
}

interface BattleFx {  /** 正在播放攻击帧的我方 / 敌方单位 key。 */
  actor: string | null;
  /** 本次攻击的目标 key，用来触发受击抖动。 */
  target: string | null;
  /** 当前攻击帧序号，null 表示不在攻击中。 */
  frame: number | null;
  /** 目标被命中的瞬间（伤害结算后）。 */
  hurt: boolean;
}

interface BattleState {

  units: BattleUnit[];
  round: number;
  log: string[];
  pending: string | null;
  menu: "command" | "attack" | "skill" | "item" | "general" | "enemy" | "target";
  cursor: number;
  skill: string | null;
  menuTitle: string;
  intro?: boolean;
  terrain?: string;
  bgm?: string;
  fx?: BattleFx | null;
  result?: "win" | "lose";
  outcome?: {
    kind: "win" | "lose" | "flee";
    title: string;
    money: number;
    exp: number;
    level: number;
    learned: string[];
  } | null;
}

/** 原版 Character.WeaponNames：剑1 刀2 枪4 斧8 弓16 */
function weaponTypeNames(bits: number) {
  return `${bits & 1 ? "剑" : ""}${bits & 2 ? "刀" : ""}${bits & 4 ? "枪" : ""}${bits & 8 ? "斧" : ""}${bits & 16 ? "弓" : ""}` || "--";
}

/** 原版 Character.TerrainNames：平2 山4 水8 */
function terrainTypeNames(bits: number) {
  return `${bits & 2 ? "平" : ""}${bits & 4 ? "山" : ""}${bits & 8 ? "水" : ""}` || "--";
}

/** 阵形第一格的原版攻防倍率 + 速度修正，给军帐阵形页做简要说明。 */
function formationEffectText(f: FormationData | null | undefined) {
  if (!f) return "原版阵形";
  const first = f.flatMags[0];
  const atk = first?.attack ?? 1;
  const hurt = first?.getHurt ?? 1;
  const buffs = (first?.buffs ?? []) as { type?: number; value?: number }[];
  const speed = buffs.find((b) => b.type === 5)?.value ?? 0;
  const parts: string[] = [];
  if (Math.abs(atk - 1) > 0.001) parts.push(`攻 ×${atk.toFixed(2)}`);
  if (Math.abs(hurt - 1) > 0.001) parts.push(`承伤 ×${hurt.toFixed(2)}`);
  if (Math.abs(speed) > 0.001) parts.push(`速 ${speed > 0 ? "+" : ""}${Math.round(speed)}`);
  if (f.useTerrain === 2) parts.push("限水边");
  return parts.join(" · ") || "无额外加成";
}

interface BattleAction {
  type: "attack" | "defend" | "skill" | "item" | "flee" | "offensive";
  target?: string;
  skill?: string;
  item?: string;
}

/** 桌面 TerrainType 位值 -> 原版战斗地形条 */
const BATTLE_TERRAIN_ASSET: Record<number, string> = {
  2: "plain",
  4: "mountain",
  8: "sea",
  16: "forest",
  32: "wasteland",
  64: "stone-array",
  128: "city",
  256: "pass",
  512: "cave",
  1024: "camp",
  2048: "cave-red",
  4096: "tunnel",
  8192: "tomb",
  16384: "canyon",
  32768: "rock",
  65536: "cave-green",
  131072: "cave-red",
  262144: "cave-blue",
  524288: "cave-peach",
  1048576: "cave-yellow",
};

function battleTerrainAsset(value: number | undefined | null): string {
  const key = BATTLE_TERRAIN_ASSET[value ?? 2] ?? "plain";
  return `/trial/tstd2/terrain/${key}.png`;
}

/** 桌面 Battle Character 的五行固定纵坐标：3.6 / 2.45 / 1.3 / 0.15 / -1.0（相机正交 5） */
const BATTLE_ROW_TOP = [18, 28.5, 39, 49.5, 60];

interface ShopState {
  title: string;
  items: { name: string; price: number; kind: "equipment" | "item" }[];
  cursor: number;
}

interface CouponVendorState {
  tab: "coupon" | "tcr";
  tickets: number;
  gold: number;
  busy: boolean;
  note: string | null;
  dailyGoldLeft: number;
}

interface SavePayload {
  version: 1;
  savedAt: number;
  sceneLevel: number;
  sceneName: string;
  previousLevel: number;
  x: number;
  y: number;
  dir: [number, number];
  party: Member[];
  money: number;
  activityRechargeGold?: number;
  activityConsumeGold?: number;
  mp: number;
  maxMp: number;
  level: number;
  exp: number;
  inventory: InventorySlot[];
  flags: Record<string, true>;
  openedChests: Record<string, true>;
  formation: string;
  chapter: number;
}

interface Snap {
  ready: boolean;
  screen: Screen;
  titleCursor: number;
  prologuePage: number;
  scene: Scene | null;
  previousLevel: number;
  x: number;
  y: number;
  dir: [number, number];
  party: Member[];
  money: number;
  /** 本档通过活动券等站外货币换得的金，计入「游戏充值活动」。 */
  activityRechargeGold?: number;
  /** 本档在游戏内花掉的金，计入「游戏消费活动」。 */
  activityConsumeGold?: number;
  mp: number;
  maxMp: number;
  level: number;
  exp: number;
  inventory: InventorySlot[];
  flags: Record<string, true>;
  openedChests: Record<string, true>;
  formation: string;
  chapter: number;
  meetStep: number;
  eventPos: Record<string, [number, number]>;
  dialogue: DialogueState | null;
  panel: PanelState | null;
  shop: ShopState | null;
  coupon: CouponVendorState | null;
  battle: BattleState | null;
  banner: string | null;
  toast: string | null;
  faded: boolean;
  shake: boolean;
  speed: number;
  log: string[];
  gameoverReason: string;
}

interface Saves {
  [slot: number]: SavePayload | null;
}

const SAVE_PREFIX = "kongming.save.";
/** 未开局时先兑换的金暂存键；下一次开局 / 读档并入存档。 */
const PENDING_GOLD_KEY = "kongming.pendingGold";
const ARROW_TO_KEY: Record<string, string> = {
  ArrowUp: "KeyW",
  ArrowDown: "KeyS",
  ArrowLeft: "KeyA",
  ArrowRight: "KeyD",
};
const DIR_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const PROLOGUE = [
  "话说天下大势  分久必合  合久必分\n东汉末年  持续了二百年之久的太平盛世终于纷乱了\n大贤良师张角率领黄巾军在各地起事\n一时间  生灵涂炭  怨声载道\n汉王朝已无力平乱\n\n值此乱世  涌现出了三位英雄  立志兴复汉室\n他们是\n中山靖王刘胜的后裔  刘备  刘玄德\n文武双全的美髯公  关羽  关云长\n有万夫不当之勇的  张飞 张翼德\n",
  "不求同年同月同日生  但求同年同月同日死 \n桃园结义的兄弟三人  招募义军  讨伐黄巾\n",
  "曹操等人也加入了讨伐黄巾军的战斗\n他们协力激战  终于战胜了张角 黄巾军被镇压了\n但是  乱世并未结束\n",
  "在平乱中按兵不动保存实力的西凉太守  董卓\n借机进入都城洛阳  专政弄权  无恶不作\n刘备等人又举兵声讨  终于消灭了董卓\n天下似乎又太平了\n\n然而......\n乱世还刚刚开始\n奸雄曹操乘乱势逐步扩大力量想一统天下\n淮南袁术无视汉王朝  妄自称帝\n\n还有......\n乱世还在继续......",
];

// 原版“序”是三页：第一页纯叙述；第二页上句 + 桃园结义 CG + 下句；第三页纯叙述。
const PROLOGUE_PAGES: { text?: string; top?: string; image?: string; bottom?: string }[] = [
  { text: PROLOGUE[0] },
  { top: PROLOGUE[1], image: "/game-assets/kongming/ui/Story2.png", bottom: PROLOGUE[2] },
  { text: PROLOGUE[3] },
];
const SCENE_ALIAS: Record<string, string> = {
  世界地图: "大地图",
  道具店: "道",
  役店: "役",
  民居: "城镇民房",
  徐州城: "徐州",
  冀州城: "冀州",
  荆州城: "荆州",
  新野城: "新野",
  江夏城: "江夏",
  襄阳城: "襄阳",
  洛阳城: "洛阳",
  柴桑城: "柴桑东村",
  长沙城: "长沙小村",
  桂阳城: "桂阳小村",
  武陵城: "武陵小村",
};
const CHAPTER_RANGES: [number, number][] = [
  [1, 23],
  [24, 39],
  [40, 53],
  [54, 79],
  [80, 94],
  [95, 114],
  [115, 145],
  [146, 172],
];

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function readSaves(): Saves {
  const out: Saves = { 0: null, 1: null, 2: null };
  if (typeof window === "undefined") return out;
  for (let i = 0; i < 3; i++) {
    try {
      const raw = localStorage.getItem(SAVE_PREFIX + i);
      if (raw) out[i] = JSON.parse(raw) as SavePayload;
    } catch {
      out[i] = null;
    }
  }
  return out;
}

function saveLabel(save: SavePayload | null) {
  if (!save) return "存档为空";
  const d = new Date(save.savedAt);
  return `${chapterName(save.chapter)} · Lv${save.level} · ${save.sceneName}`;
}

function baseName(name: string) {
  return (name || "").split("#")[0];
}

function normalizeSceneName(name: string) {
  return SCENE_ALIAS[name] ?? baseName(name);
}

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

/** 桌面版 SceneData.backgroundMusic 的 AudioClip 名 → 导出的 OGG。 */
const KONGMING_BGM_FILES: Record<string, string> = {
  Title: "title.ogg",
  GameStart: "game-start.ogg",
  GameEnd: "game-end.ogg",
  World1: "world-1.ogg",
  World2: "world-2.ogg",
  City: "city.ogg",
  Palace: "palace.ogg",
  Store: "store.ogg",
  Village: "village.ogg",
  Temple: "temple.ogg",
  Cave1: "cave-1.ogg",
  Cave2: "cave-2.ogg",
  Forest: "forest.ogg",
  Mount: "mount.ogg",
  Island: "island.ogg",
  Battle2: "battle-2.ogg",
  Battle3: "battle-3.ogg",
  Boss: "boss.ogg",
  吞食天地1英杰之语: "heroes.ogg",
};

const KONGMING_BOSS_BATTLES = [
  "1-袁术战",
  "4-大蛇-山顶",
  "5-吕布终战-零陵",
  "6-刘璋-成都",
  "7-曹操终战-葫芦谷",
  "8-司马懿终战-洛阳",
  "战斗测试",
];

/** 桌面版 BattleInfo.backgroundMusic：121 场中 Boss 7 场、Battle3 1 场。 */
function kongmingBattleBgm(name?: string) {
  if (name === "8-长安英杰之地-训练") return "Battle3";
  return name && KONGMING_BOSS_BATTLES.includes(name) ? "Boss" : "Battle2";
}

function kongmingBgmSrc(clip: string | null | undefined) {
  if (!clip) return null;
  const file = KONGMING_BGM_FILES[clip];
  return file ? `/game-assets/kongming/bgm/${file}` : null;
}

/**
 * 桌面版行走条带：每帧 64×64，角色本体 32×32 居中，脚底在帧内 y=61。
 * 必须按 64 帧原样绘制，压成 36 会把角色缩成半格、站到门格外。
 */
const WALK_CELL = 64;
/** 帧顶到角色落点的距离：帧顶 = 实体 y - 60，脚底落点 = 实体 y + 1。 */
const WALK_FOOT = 60;

/** 桌面版 Direction：0 下、1 上、2 左、3 右。 */
const DIR_VECTORS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

function movementAreaEmpty(area: [number, number]) {
  return area[0] <= 0 && area[1] <= 0;
}

/** 桌面版室内场景的相机底色是纯黑，不能拿城外草地纹理去补边。 */
function isIndoorScene(name: string) {
  const base = baseName(name).trim();
  // “武 / 道 / 宿 / 训 / 役 / 编”是原版店铺的单字场景名，没有“店/房”等后缀。
  if (["武", "道", "宿", "训", "役", "编"].includes(base)) return true;
  return /(宫殿|皇宫|宫|殿|府|宅|屋|寺|观|酒楼|客栈|衙门|民居|房|室|宿|武器店|店|馆)/.test(name);
}

/** 单位贴图是 8 帧横向条带：Direction 顺序为 下、上、左、右，各两帧。 */
function frameForDir(dir: [number, number], phase = 0) {
  const [dx, dy] = dir;
  let base = 0;
  if (dy > 0) base = 2;
  else if (dx > 0) base = 6;
  else if (dx < 0) base = 4;
  else if (dy < 0) base = 0;
  return base + (phase % 2);
}

/** Desktop TeamMove keeps every member on the previous head tile, one step behind the leader. */
function seedTeamTrail(x: number, y: number, dir: [number, number], count: number) {
  const [dx, dy] = dir;
  return Array.from({ length: Math.max(0, count) }, (_, i) => ({
    x: x - dx * (i + 1),
    y: y - dy * (i + 1),
    dir,
  }));
}

/** Desktop QuestEvent show/hide conditions: single ids combined with & / | and T / F suffixes. */
function evalEventCondition(expr: string, flags: Record<string, true>) {
  const text = expr.trim();
  if (!text) return true;
  return text.split("|").some((part) =>
    part.split("&").every((token) => {
      const word = token.trim().replace(/^\(+|\)+$/g, "");
      if (!word) return true;
      const negate = word.startsWith("!");
      const key = negate ? word.slice(1) : word;
      if (key.endsWith("T")) return !negate && !!flags[key.slice(0, -1)];
      if (key.endsWith("F")) return negate ? false : !flags[key.slice(0, -1)];
      if (key.endsWith("SO")) return !!flags[key.slice(0, -2)];
      return negate ? !flags[key] : !!flags[key];
    }),
  );
}

/**
 * Drops flags whose own event chain was never actually reached.
 * Example: `11011 车胄` requires `11009 袁术`, and `11009` itself requires `11008 袁胤`.
 * A stale save may contain `11009` without `11008`; without this check 车胄/陈登 show too early.
 */
function pruneInvalidEventFlags(flags: Record<string, true>, scenes: Scene[]) {
  const byId = new Map<string, SceneEvent>();
  for (const scene of scenes) for (const ev of scene.events) if (ev.id) byId.set(ev.id, ev);
  const memo = new Map<string, boolean>();
  const visiting = new Set<string>();

  function checkExpr(expr: string): boolean {
    return expr
      .trim()
      .split("|")
      .some((part) =>
        part.split("&").every((token) => {
          const raw = token.trim().replace(/^\(+|\)+$/g, "");
          if (!raw) return true;
          const negate = raw.startsWith("!");
          const word = negate ? raw.slice(1) : raw;
          let ok: boolean;
          if (word.endsWith("T")) ok = valid(word.slice(0, -1));
          else if (word.endsWith("F")) ok = !valid(word.slice(0, -1));
          else if (word.endsWith("SO")) ok = valid(word.slice(0, -2));
          else ok = valid(word);
          return negate ? !ok : ok;
        }),
      );
  }

  function valid(id: string): boolean {
    if (memo.has(id)) return memo.get(id)!;
    if (!flags[id]) return false;
    const ev = byId.get(id);
    if (!ev) return true;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const ok = ev.show ? checkExpr(ev.show) : true;
    visiting.delete(id);
    memo.set(id, ok);
    return ok;
  }

  const next: Record<string, true> = {};
  for (const key of Object.keys(flags ?? {})) {
    const ev = byId.get(key);
    if (!ev || valid(key)) next[key] = true;
  }
  return next;
}

/** All scene events by id, used to validate `show` prerequisite chains on every visibility check. */
let EVENT_INDEX: Map<string, SceneEvent> | null = null;
function indexEventChain(scenes: Scene[]) {
  const map = new Map<string, SceneEvent>();
  for (const scene of scenes) for (const ev of scene.events) if (ev.id) map.set(ev.id, ev);
  EVENT_INDEX = map;
}

function showChainReached(expr: string, flags: Record<string, true>, seen = new Set<string>()): boolean {
  const index = EVENT_INDEX;
  if (!index || !expr.trim()) return true;
  const memo = new Map<string, boolean>();
  const valid = (id: string): boolean => {
    if (!flags[id]) return false;
    const ev = index.get(id);
    if (!ev || !ev.show) return true;
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return true;
    seen.add(id);
    const ok = showChainReached(ev.show, flags, seen);
    seen.delete(id);
    memo.set(id, ok);
    return ok;
  };
  return expr
    .trim()
    .split("|")
    .some((part) =>
      part.split("&").every((token) => {
        const raw = token.trim().replace(/^\(+|\)+$/g, "");
        if (!raw || raw.startsWith("!")) return true;
        if (raw.endsWith("T") || raw.endsWith("SO")) return valid(raw.slice(0, raw.endsWith("SO") ? -2 : -1));
        if (raw.endsWith("F")) return !valid(raw.slice(0, -1));
        return valid(raw);
      }),
    );
}

/** Mirrors QuestEvent.Refresh: chapter mismatch, hide condition, show condition, startHide. */
function eventVisible(ev: SceneEvent, flags: Record<string, true>, chapterName?: string) {
  if (ev.chapter) {
    if (!chapterName || ev.chapter.trim() !== chapterName.trim()) return false;
  }
  if (ev.hideAfter && flags[ev.id]) return false;
  if (ev.hide && evalEventCondition(ev.hide, flags)) return false;
  if (ev.show) return evalEventCondition(ev.show, flags) && showChainReached(ev.show, flags);
  return !ev.startHide;
}

function sceneLabel(scene: Scene | null) {
  if (!scene) return "";
  return baseName(scene.name);
}


function flattenArgs(args: unknown[]): unknown[] {
  return args.flatMap((a) => (Array.isArray(a) ? a : [a]));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const EMPTY_SNAP: Snap = {
  ready: false,
  screen: "loading",
  titleCursor: 2,
  prologuePage: 0,
  scene: null,
  previousLevel: 0,
  x: 0,
  y: 0,
  dir: [0, -1],
  party: [],
  money: 0,
  activityRechargeGold: 0,
  activityConsumeGold: 0,
  mp: 10,
  maxMp: 10,
  level: 1,
  exp: 0,
  inventory: [],
  flags: {},
  openedChests: {},
  formation: "散开阵",
  chapter: 1,
  meetStep: 0,
  eventPos: {},
  dialogue: null,
  panel: null,
  shop: null,
  coupon: null,
  battle: null,
  banner: null,
  toast: null,
  faded: false,
  shake: false,
  speed: 1,
  log: [],
  gameoverReason: "",
};

export default function KongmingGame({
  activity = null,
  couponGoldOffers = [
    { tickets: 1, gold: 100 },
    { tickets: 5, gold: 500 },
    { tickets: 25, gold: 2500 },
  ],
  goldPerTcr = 100,
  goldTcrOffers = [
    { gold: 100, tcr: 1 },
    { gold: 500, tcr: 5 },
    { gold: 2500, tcr: 25 },
  ],
  maxGoldPerTcrDaily = 2500,
  tcrValidDays = 30,
}: {
  /** 已登录时的孔明券视图；未登录 / 活动关闭时为 null，不显示兑换面板。 */
  activity?: ActivityCouponView | null;
  couponGoldOffers?: KongmingCouponGoldOffer[];
  goldPerTcr?: number;
  goldTcrOffers?: KongmingGoldTcrOffer[];
  maxGoldPerTcrDaily?: number;
  tcrValidDays?: number;
} = {}) {
  const [snap, setSnap] = useState<Snap>(EMPTY_SNAP);
  const frameWrapRef = useRef<HTMLDivElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  /** iOS / 不支持 Element Fullscreen 的移动浏览器用固定层铺满视口兜底。 */
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const fullscreenView = fullscreen || pseudoFullscreen;
  useEffect(() => {
    const sync = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      const active = document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      setFullscreen(active === frameWrapRef.current);
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);
  useEffect(() => {
    if (!pseudoFullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPseudoFullscreen(false);
    };
    window.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", escape);
    };
  }, [pseudoFullscreen]);
  const toggleFullscreen = useCallback(async () => {
    const wrap = frameWrapRef.current;
    if (!wrap) return;
    if (pseudoFullscreen) {
      setPseudoFullscreen(false);
      return;
    }
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    if (document.fullscreenElement === wrap || doc.webkitFullscreenElement === wrap) {
      try {
        (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.();
        if (document.fullscreenElement) await document.exitFullscreen();
        else await doc.webkitExitFullscreen?.();
      } catch {
        // 浏览器拒绝退出时保持当前全屏状态。
      }
      return;
    }
    const legacy = wrap as HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void };
    try {
      let entered = false;
      if (typeof wrap.requestFullscreen === "function") {
        await wrap.requestFullscreen({ navigationUI: "hide" });
        entered = true;
      } else if (typeof legacy.webkitRequestFullscreen === "function") {
        await legacy.webkitRequestFullscreen();
        entered = true;
      }
      if (!entered) {
        setPseudoFullscreen(true);
        return;
      }
      try {
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (mode: string) => Promise<void>;
        };
        await orientation?.lock?.("landscape");
      } catch {
        // 横屏锁定多数移动浏览器会拒绝，保留已进入的全屏即可。
      }
    } catch {
      // iPhone Safari 等没有元素全屏能力时，用固定铺满兜底，至少能横屏游玩。
      setPseudoFullscreen(true);
    }
  }, [pseudoFullscreen]);
  const [couponTickets, setCouponTickets] = useState(activity?.tickets ?? 0);
  const [npcWalk, setNpcWalk] = useState<Record<string, NpcWalkState>>({});
  const npcWalkRef = useRef<Record<string, NpcWalkState>>({});
  const [npcClock, setNpcClock] = useState(0);
  const [battleAnimFrame, setBattleAnimFrame] = useState(0);
  const snapRef = useRef<Snap>(EMPTY_SNAP);
  /** 进室内 / 洞窟前在场景中的落脚点；type 3 出口按原版回到这扇门口。 */
  const returnPosRef = useRef<{ level: number; x: number; y: number; dir: [number, number] } | null>(null);
  /** 刚进入场景时落在门口，先压住这道门的回程触发，离开范围后再恢复。 */
  const arrivalGuardRef = useRef<{ level: number; x: number; y: number; radius: number } | null>(null);
  const [data, setData] = useState<GameData | null>(null);
  const [touchMode, setTouchMode] = useState(false);
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (coarse || navigator.maxTouchPoints > 0) setTouchMode(true);
    const enable = (event: Event) => {
      if (event instanceof PointerEvent && event.pointerType !== "touch") return;
      setTouchMode(true);
    };
    window.addEventListener("touchstart", enable, { passive: true });
    window.addEventListener("pointerdown", enable);
    return () => {
      window.removeEventListener("touchstart", enable);
      window.removeEventListener("pointerdown", enable);
    };
  }, []);
  const dataRef = useRef<GameData | null>(null);
  const savesRef = useRef<Saves>({ 0: null, 1: null, 2: null });
  const dialogResolve = useRef<((value: boolean) => void) | null>(null);
  const battleResolve = useRef<((value: BattleAction) => void) | null>(null);
  const battleEndResolve = useRef<(() => void) | null>(null);
  const shopResolve = useRef<(() => void) | null>(null);
  const battleLoopResolve = useRef<((result: number) => void) | null>(null);
  const runEventRef = useRef<((ev: SceneEvent) => Promise<void>) | null>(null);
  const openShopRef = useRef<(() => Promise<void>) | null>(null);
  const openCouponRef = useRef<(() => void) | null>(null);
  const locked = useRef(false);
  const activeEvent = useRef<SceneEvent | null>(null);
  const currentSceneToken = useRef(0);
  const maskCache = useRef<Map<number, Uint8Array>>(new Map());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoEventToken = useRef(0);
  const moving = useRef(false);
  const moveRef = useRef<((dx: number, dy: number) => void) | null>(null);
  const heldKeys = useRef<Set<string>>(new Set());
  const trailRef = useRef<{ x: number; y: number; dir: [number, number] }[]>([]);
  const followPosRef = useRef<{ x: number; y: number; dir: [number, number] }[]>([]);
  const storyViewRef = useRef<HTMLDivElement | null>(null);
  const fieldViewRef = useRef<HTMLDivElement | null>(null);
  // 逻辑分辨率固定 800×450（原版 Camera.orthographicSize=7 的 25×14 格视野）。
  // 只能用整数倍放大 + 整像素定位，否则瓦片会被浏览器重采样，烘焙阴影边缘出现半像素断层。
  const [viewScale, setViewScale] = useState(1);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const suppressInteractUntil = useRef(0);

  useEffect(() => {
    const el = fieldViewRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const fit = Math.min(rect.width / 800, rect.height / 450);
      // 够 1 倍就只用整数倍放大，瓦片才不会重采样；不足 1 倍（小屏）才按比例缩。
      const integer = fit >= 1;
      const next = integer ? Math.floor(fit + 0.0001) : fit;
      // 整数倍时把画面左上角对齐到整像素，地图像素才能和屏幕像素 1:1。
      const dx = integer ? Math.round(rect.left + (rect.width - 800 * next) / 2) - rect.left : (rect.width - 800 * next) / 2;
      const dy = integer ? Math.round(rect.top + (rect.height - 450 * next) / 2) - rect.top : (rect.height - 450 * next) / 2;
      setViewScale((prev) => (prev === next ? prev : next));
      setViewOffset((prev) => (prev.x === dx && prev.y === dy ? prev : { x: dx, y: dy }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });

  const mutate = useCallback((fn: (prev: Snap) => Snap) => {
    const next = fn(snapRef.current);
    snapRef.current = next;
    setSnap(next);
    return next;
  }, []);

  const toast = useCallback((text: string) => {
    mutate((s) => ({ ...s, toast: text }));
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => mutate((s) => ({ ...s, toast: null })), 2200);
  }, [mutate]);

  const banner = useCallback((text: string) => {
    mutate((s) => ({ ...s, banner: text }));
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => mutate((s) => ({ ...s, banner: null })), 2600);
  }, [mutate]);

  /**
   * 活动券兑来的金：已在游戏里就直接入账；还在封面 / 加载页就先落
   * localStorage，等「初出茅庐」或「匡扶汉室」把金并进存档。
   */
  const receiveGold = useCallback((gold: number) => {
    if (gold <= 0) return;
    const current = snapRef.current;
    if (current.screen === "title" || current.screen === "loading") {
      const pending = Number(localStorage.getItem(PENDING_GOLD_KEY) ?? 0) || 0;
      localStorage.setItem(PENDING_GOLD_KEY, String(pending + gold));
      toast(`军资 ${gold} 金已寄存，开局后并入存档`);
      return;
    }
    mutate((s) => ({
      ...s,
      money: Math.min(9_999_999, s.money + gold),
      activityRechargeGold: (s.activityRechargeGold ?? 0) + gold,
    }));
    toast(`军资到账：+${gold} 金`);
  }, [mutate, toast]);

  const applyPendingGold = useCallback(() => {
    const pending = Number(localStorage.getItem(PENDING_GOLD_KEY) ?? 0) || 0;
    if (pending <= 0) return;
    localStorage.removeItem(PENDING_GOLD_KEY);
    mutate((s) => ({
      ...s,
      money: Math.min(9_999_999, s.money + pending),
      activityRechargeGold: (s.activityRechargeGold ?? 0) + pending,
    }));
    toast(`活动军资到账：+${pending} 金`);
  }, [mutate, toast]);

  useEffect(() => {
    if (snap.screen !== "title" && snap.screen !== "loading") applyPendingGold();
  }, [snap.screen, applyPendingGold]);

  /* ------------------------------------------------------------------ */
  /* Map preload                                                         */
  /* ------------------------------------------------------------------ */

  // 原版换场是即时的：进新场景前地图纹理已经采样完成。
  // 这里在当前场景停留时预热所有可去的相邻地图，避免出城后先黑屏再等大图解码。
  const sceneLevel = snap.scene?.level ?? 0;
  useEffect(() => {
    if (!data || !sceneLevel || typeof window === "undefined") return;
    const scene = data.scenes.find((s) => s.level === sceneLevel);
    if (!scene) return;
    const urls = new Set<string>();
    for (const t of scene.transitions) {
      const candidates = data.scenesByName.get(baseName(t.scene)) ?? [];
      for (const c of candidates) {
        if (c.map?.src) {
          urls.add(c.map.src);
          if (c.map.fg) urls.add(c.map.fg);
          if (c.map.src.endsWith("level3.png")) {
            for (let i = 0; i < 4; i++) urls.add(`${c.map.src.slice(0, -4)}-water-${i}.png`);
          }
        }
      }
    }
    const imgs: HTMLImageElement[] = [];
    for (const url of urls) {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      imgs.push(img);
    }
    return () => {
      for (const img of imgs) img.src = "";
    };
  }, [data, sceneLevel]);

  useEffect(() => {
    if (snap.screen === "loading") return;
    // 孔明传全部改用桌面版 SceneData.backgroundMusic 对应 OGG；合成主题只留给工坊。
    gameAudio.setTheme(null);
    let track: string | null = null;
    if (snap.screen === "title") track = "Title";
    else if (snap.screen === "prologue") track = "GameStart";
    else if (snap.screen === "battle") track = snap.battle?.bgm ?? "Battle2";
    else if (snap.screen === "gameover") track = "GameEnd";
    else if (snap.screen === "field") {
      // 第五章起世界地图使用章节背景 World2；原版前四章留 SceneData 的 World1。
      track = snap.scene?.isWorld && snap.chapter >= 5 ? "World2" : snap.scene?.bgm ?? null;
    }
    gameAudio.setBgm(kongmingBgmSrc(track));
    gameAudio.unlockOnGesture();
  }, [snap.screen, snap.scene?.level, snap.scene?.bgm, snap.scene?.isWorld, snap.chapter, snap.battle?.bgm]);

  useEffect(() => () => {
    gameAudio.setBgm(null);
    gameAudio.setTheme(null);
  }, []);

  useEffect(() => {
    loadGameData()
      .then((d) => {
        dataRef.current = d;
        setData(d);
        indexEventChain(d.scenes);
        savesRef.current = readSaves();
        mutate((s) => ({ ...s, ready: true, screen: "title", titleCursor: 2 }));
      })
      .catch((e) => {
        console.error(e);
        toast("游戏数据加载失败，请刷新重试");
      });
  }, [mutate, toast]);

  const currentData = useCallback(() => {
    const d = dataRef.current;
    if (!d) throw new Error("游戏数据尚未加载");
    return d;
  }, []);

  const makeMember = useCallback((name: string, level: number, dataOverride?: GameData): Member | null => {
    const d = dataOverride ?? dataRef.current;
    if (!d) return null;
    const c = d.characters.get(name);
    if (!c) return null;
    const maxHp = hpFor(c, d.hpLevels, level);
    const learned = new Set(learnedAtLevel(d.content, level).skills);
    return {
      key: `c${c.id}-${name}`,
      name,
      id: c.id,
      profile: c.profile ?? name,
      model: c.modelTexture,
      level,
      hp: maxHp,
      maxHp,
      equipment: {},
      skills: c.skills.filter((sk) => learned.has(sk)),
      dead: false,
    };
  }, []);

  const memberSkillsAtLevel = useCallback((m: Member, level = m.level) => {
    const d = dataRef.current;
    if (!d) return [];
    const learned = new Set(learnedAtLevel(d.content, level).skills);
    return (d.characters.get(m.name)?.skills ?? []).filter((name) => learned.has(name));
  }, []);

  const recalcHp = useCallback((m: Member, level = m.level): Member => {
    const d = dataRef.current;
    if (!d) return m;
    const c = d.characters.get(m.name);
    const max = hpFor(c, d.hpLevels, level);
    // 原版 `Character.LevelUp` 只抬高 `MaxHp`，当前 `Hp` 原样保留；
    // 升级不回血，也不会按百分比把残血放大。
    const hp = Math.min(max, Math.max(0, m.hp));
    return { ...m, level, maxHp: max, hp, dead: hp <= 0 };
  }, []);

  const equipmentStats = useCallback((m: Member) => {
    const d = dataRef.current;
    const out = { atk: 0, def: 0, str: 0, ler: 0, spd: 0 };
    if (!d) return out;
    for (const slot of Object.keys(m.equipment)) {
      const name = m.equipment[Number(slot)];
      const e = name ? d.equipment.get(name) : null;
      if (!e) continue;
      out.atk += e.stats[2] ?? 0;
      out.def += e.stats[3] ?? 0;
      out.str += e.stats[4] ?? 0;
      out.ler += e.stats[5] ?? 0;
      out.spd += e.stats[6] ?? 0;
    }
    return out;
  }, []);

  const memberCombatStats = useCallback((m: Member, level = m.level) => {
    const d = dataRef.current;
    const c = d?.characters.get(m.name);
    const eq = equipmentStats(m);
    return {
      maxHp: hpFor(c, d?.hpLevels ?? new Map(), level),
      atk: (c?.stats[2] ?? 0) + eq.atk,
      def: (c?.stats[3] ?? 0) + eq.def,
      str: (c?.stats[4] ?? 60) + eq.str,
      ler: (c?.stats[5] ?? 40) + eq.ler,
      spd: (c?.stats[6] ?? 50) + eq.spd,
    };
  }, [equipmentStats]);

  const autoEquip = useCallback((party: Member[], inventory: InventorySlot[], onlyLeader = false) => {
    const d = dataRef.current;
    if (!d) return { party, inventory };
    let inv = inventory.map((s) => ({ ...s }));
    let members = party.map((m) => ({ ...m, equipment: { ...m.equipment } }));
    const targets = onlyLeader ? members.slice(0, 1) : members;
    for (const m of targets) {
      for (let slot = 0; slot <= 3; slot++) {
        if (m.equipment[slot]) continue;
        const idx = inv.findIndex((s) => {
          const e = d.equipment.get(s.name);
          return s.count > 0 && e && e.equipType === slot;
        });
        if (idx < 0) continue;
        const chosen = inv[idx];
        m.equipment[slot] = chosen.name;
        chosen.count--;
      }
      m.hp = m.maxHp;
    }
    inv = inv.filter((s) => s.count > 0);
    members = members.map((m) => recalcHp(m));
    return { party: members, inventory: inv };
  }, [recalcHp]);

  const addExp = useCallback((amount: number, level: number, exp: number) => {
    const d = dataRef.current;
    if (!d) return { level, exp, skills: [] as string[], formations: [] as string[] };
    const rows = d.content.exp.levels;
    let lv = level;
    let cur = exp + amount;
    const learnedSkills: string[] = [];
    const learnedFormations: string[] = [];
    // 桌面版 `TeamManager.AddExp` 在 `ExpData.Level(lv)` 取不到更高级行时
    // 仍返回最后一行的 next，因此 52 级以后每级继续按最后一行经验升级；
    // 角色等级上限 99。这里同样不把 0 当停止条件，只有真正没有经验表才停。
    for (let guard = 0; guard < 120; guard++) {
      const row = rows[Math.min(lv - 1, rows.length - 1)];
      const next = row?.next ?? 0;
      if (!next || lv >= 99 || cur < next) break;
      cur -= next;
      lv++;
      const newRow = rows[lv - 1];
      if (newRow) {
        learnedSkills.push(...newRow.skills);
        learnedFormations.push(...newRow.formations);
      }
    }
    return { level: lv, exp: cur, skills: learnedSkills, formations: learnedFormations };
  }, []);

  /* ------------------------------------------------------------------ */
  /* Scene movement and collision                                        */
  /* ------------------------------------------------------------------ */

  const decodeMask = useCallback((scene: Scene) => {
    const cached = maskCache.current.get(scene.level);
    if (cached) return cached;
    if (!scene.blockedMask) return null;
    const raw = atob(scene.blockedMask);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    maskCache.current.set(scene.level, bytes);
    return bytes;
  }, []);

  const blockedAt = useCallback((scene: Scene, x: number, y: number) => {
    if (!scene.map) return false;
    const map = scene.map;
    // 城门在原版 TilemapCollider 里仍是整排墙；只要贴着通往大地图的出口，
    // 就放行这一格，让玩家能从任意一个门走出去再触发切场景。
    // 裁边后城门触发点常在地图边界外 0.4~0.5 格，必须放在 bounds 判定之前，
    // 否则站在边界内侧的玩家再走一步会先被地图边界挡住，永远踩不到传送点。
    // 室内出口同理：原版门格常被 TilemapCollider 标成实心，或被裁到边界上；
    // 只放行传送点附近的门格，避免整面墙变可穿。世界地图仍只放行“大地图”
    // 出口，避免把 [0,0] 这类未启用的占位传送点变成可踩的洞。
    const door = scene.transitions.find((t) => {
      if (t.when !== 1) return false;
      if (scene.isWorld && t.scene !== "大地图") return false;
      const radius = t.scene === "大地图" ? 1.6 : 0.8;
      return dist(t.pos[0], t.pos[1], x, y) < radius;
    });
    if (door) return false;
    if (x < map.x || x > map.x + map.w - 1 || y < map.y || y > map.y + map.h - 1) return true;
    for (const box of scene.boxes) {
      const [cx, cy, w, h] = box;
      if (Math.abs(x - cx) <= w / 2 && Math.abs(y - cy) <= h / 2) return true;
    }
    const bytes = decodeMask(scene);
    if (!bytes) return false;
    // 徐州宫殿御座前的台阶在原始 TilemapCollider 中被整排标成实心，
    // 但原版可以从中央台阶走下。这里对这段台阶做通行修正。
    if (scene.level === 12 && y >= -2 && y <= -1 && x >= -8 && x <= 0) return false;
    const ix = Math.round(x - map.x);
    const iy = Math.round(map.y + map.h - 1 - y);
    if (ix < 0 || iy < 0 || ix >= map.w || iy >= map.h) return true;
    const bit = iy * map.w + ix;
    return !!(bytes[bit >> 3] & (1 << (bit & 7)));
  }, [decodeMask]);

  /** NPC 待机帧计时：桌面版 characterAnimSpeed=0.6s 一帧。 */
  useEffect(() => {
    if (snap.screen !== "field") return;
    const timer = window.setInterval(() => setNpcClock((value) => value + 1), 150);
    return () => window.clearInterval(timer);
  }, [snap.screen]);

  useEffect(() => {
    npcWalkRef.current = npcWalk;
  }, [npcWalk]);

  /** 进入新场景时，把 NPC 放回事件的落点，按桌面版 dirs 选初始朝向。 */
  useEffect(() => {
    const scene = snapRef.current.scene;
    if (!scene || snap.screen !== "field") {
      setNpcWalk({});
      return;
    }
    const initial: Record<string, NpcWalkState> = {};
    for (const event of scene.events) {
      if (!event.id) continue;
      const motion = npcMotionFor(scene.level, event.id);
      if (!motion) continue;
      initial[event.id] = {
        x: event.pos[0],
        y: event.pos[1],
        dir: DIR_VECTORS[motion.dirs[0]] ?? [0, -1],
        wait: Math.max(0.2, motion.wait + (Math.random() * 1.6 - 0.8)),
      };
    }
    setNpcWalk(initial);
  }, [snap.scene?.level, snap.screen]);

  /** 桌面版 NPC.Move：随机方向走一格，约 1±0.8 秒后再走；活动范围 5×3。 */
  useEffect(() => {
    if (snap.screen !== "field") return;
    const scene = snapRef.current.scene;
    if (!scene) return;
    const timer = window.setInterval(() => {
      const current = snapRef.current;
      if (current.dialogue || current.panel || current.shop || current.battle) return;
      setNpcWalk((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const event of scene.events) {
          if (!event.id) continue;
          const motion = npcMotionFor(scene.level, event.id);
          if (!motion || motion.speed <= 0 || movementAreaEmpty(motion.area)) continue;
          const state = prev[event.id];
          if (!state) continue;

          if (state.move) {
            const duration = Math.max(150, 1000 / motion.speed);
            const progress = Math.min(1, state.move.progress + 100 / duration);
            if (progress >= 1) {
              next[event.id] = {
                ...state,
                x: state.move.tx,
                y: state.move.ty,
                move: undefined,
                wait: Math.max(0.2, motion.wait + (Math.random() * 1.6 - 0.8)),
              };
            } else {
              next[event.id] = {
                ...state,
                x: state.x + (state.move.tx - state.x) * progress,
                y: state.y + (state.move.ty - state.y) * progress,
                move: { ...state.move, progress },
              };
            }
            changed = true;
            continue;
          }

          if (state.wait > 0) {
            next[event.id] = { ...state, wait: state.wait - 0.1 };
            changed = true;
            continue;
          }

          const dirIndex = motion.dirs[Math.floor(Math.random() * motion.dirs.length)] ?? 0;
          const [dx, dy] = DIR_VECTORS[dirIndex] ?? [0, -1];
          const tx = state.x + dx;
          const ty = state.y + dy;
          const inside =
            Math.abs(tx - motion.base[0]) <= motion.area[0] &&
            Math.abs(ty - motion.base[1]) <= motion.area[1];
          const occupied = Object.entries(prev).some(([id, other]) =>
            id !== event.id && Math.abs(other.x - tx) < 0.7 && Math.abs(other.y - ty) < 0.7,
          );
          const nearPlayer = Math.abs(current.x - tx) < 0.7 && Math.abs(current.y - ty) < 0.7;
          if (inside && !blockedAt(scene, tx, ty) && !occupied && !nearPlayer) {
            next[event.id] = {
              ...state,
              dir: [dx, dy],
              move: { tx, ty, progress: 0 },
              wait: 0,
            };
          } else {
            next[event.id] = { ...state, dir: [dx, dy], wait: 0.5 };
          }
          changed = true;
        }
        return changed ? next : prev;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [snap.screen, snap.scene?.level, blockedAt]);

  const spawnFor = useCallback((scene: Scene, tag?: string) => {
    const raw = (() => {
      const wanted = tag?.trim();
      if (wanted) {
        const exact = scene.destinations.find((d) => d.tag === wanted);
        if (exact) return { x: exact.pos[0], y: exact.pos[1] };
      }
      if (scene.start) return { x: scene.start[0], y: scene.start[1] };
      const first = scene.destinations[0];
      if (first) return { x: first.pos[0], y: first.pos[1] };
      if (scene.map) {
        const dest = scene.destinations.find((d) => d.tag);
        if (dest) return { x: dest.pos[0], y: dest.pos[1] };
        return { x: scene.map.x + Math.floor(scene.map.w / 2), y: scene.map.y + Math.floor(scene.map.h / 2) };
      }
      return { x: 0, y: 0 };
    })();
    // 入口点可能来自原版里未启用的旧坐标，裁边后会落到图外十几格；
    // 先夹回地图边界内，再向外找最近的可走格，避免读档 / 切场景后角色
    // 站在黑底里，连传送点都踩不到。
    const base = scene.map
      ? {
          x: Math.min(Math.max(raw.x, scene.map.x + 0.2), scene.map.x + scene.map.w - 1.2),
          y: Math.min(Math.max(raw.y, scene.map.y + 0.2), scene.map.y + scene.map.h - 1.2),
        }
      : raw;
    if (!blockedAt(scene, base.x, base.y)) return base;
    let best: { x: number; y: number } | null = null;
    let bestScore = -Infinity;
    for (let r = 1; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = base.x + dx;
          const y = base.y + dy;
          if (blockedAt(scene, x, y)) continue;
          const exits = [[1, 0], [-1, 0], [0, 1], [0, -1]]
            .filter(([ox, oy]) => !blockedAt(scene, x + ox, y + oy)).length;
          const score = exits * 100 - Math.hypot(dx, dy);
          if (score > bestScore) {
            bestScore = score;
            best = { x, y };
          }
        }
      }
      if (best) return best;
    }
    return base;
  }, [blockedAt]);

  const chooseScene = useCallback((name: string, tag?: string, preferredLevel?: number, previousLevel?: number) => {
    const d = currentData();
    const wanted = normalizeSceneName(name);
    const candidates = d.scenesByName.get(wanted) ?? d.scenesByName.get(baseName(name)) ?? [];
    if (candidates.length === 0) return null;
    const current = snapRef.current;
    const chapter = chapterName(current.chapter);
    const currentLevel = current.scene?.level ?? 0;
    const range = CHAPTER_RANGES[current.chapter - 1] ?? [1, 172];
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const c of candidates) {
      let score = 0;
      if (c.name === name) score += 4;
      if (c.events.some((e) => e.chapter === chapter)) score += 90;
      if (c.previous === baseName(current.scene?.name ?? "")) score += 14;
      if (preferredLevel === c.level) score += 100;
      if (previousLevel === c.level) score += 60;
      if (wanted === "世界地图" && c.isWorld) score += 30;
      const inRange = c.level >= range[0] && c.level <= range[1];
      score += inRange ? 24 : -Math.min(30, Math.abs(c.level - range[0]));
      if (tag && c.destinations.some((dd) => dd.tag === tag)) score += 10;
      score -= Math.abs(c.level - currentLevel) / 200;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }, [currentData]);

  const runAutoEvents = useCallback((scene: Scene, spawn: { x: number; y: number }, token: number) => {
    if (token !== currentSceneToken.current) return;
    const chapter = chapterName(snapRef.current.chapter);
    const flags = snapRef.current.flags;
    const events = scene.events.filter((e) => {
      if (!e.id) return false;
      if (e.when !== 0 && e.when !== 5) return false;
      if (flags[e.id]) return false;
      return eventVisible(e, flags, chapter);
    });
    if (events.length > 0) {
      const ev = events[0];
      setTimeout(() => {
        if (token !== currentSceneToken.current) return;
        runEventRef.current?.(ev);
      }, 420);
    }
  }, []);

  const loadScene = useCallback((level: number, tag?: string, keepPrevious = true, at?: { x: number; y: number; dir: [number, number] } | null) => {
    arrivalGuardRef.current = null;
    const d = currentData();
    const scene = d.scenes.find((s) => s.level === level) ?? d.scenes[0];
    if (!scene) return;
    const prev = snapRef.current;
    if (prev.scene && prev.scene.level !== level) {
      returnPosRef.current = { level: prev.scene.level, x: prev.x, y: prev.y, dir: prev.dir };
    }
    const spawn = at ? { x: at.x, y: at.y } : spawnFor(scene, tag);
    const backDir: [number, number] = at && (at.dir[0] !== 0 || at.dir[1] !== 0)
      ? [-at.dir[0] as number, -at.dir[1] as number]
      : (scene.level === 12 ? [0, 1] : [0, -1]);
    const token = ++currentSceneToken.current;
    autoEventToken.current = token;
    const arrival = scene.transitions
      .filter((t) => t.when === 1)
      .map((t) => ({
        ...t,
        radius: t.scene === "大地图" ? 1.6 : 0.8,
        distance: dist(t.pos[0], t.pos[1], spawn.x, spawn.y),
      }))
      .filter((t) => t.distance < t.radius)
      .sort((a, b) => a.distance - b.distance)[0];
    arrivalGuardRef.current = arrival
      ? { level, x: arrival.pos[0], y: arrival.pos[1], radius: arrival.radius }
      : null;
    trailRef.current = seedTeamTrail(spawn.x, spawn.y, backDir, Math.max(0, prev.party.length - 1));
    followPosRef.current = trailRef.current.map((p) => ({ ...p }));
    mutate((s) => ({
      ...s,
      screen: "field",
      scene,
      previousLevel: keepPrevious && s.scene && s.scene.level !== level ? s.scene.level : s.previousLevel,
      x: spawn.x,
      y: spawn.y,
      dir: backDir,
      meetStep: 0,
      eventPos: {},
      flags: pruneInvalidEventFlags(s.flags, d.scenes),
      dialogue: null,
      panel: null,
      shop: null,
      coupon: null,
      battle: null,
      prologuePage: s.prologuePage,
      toast: null,
    }));
    setTimeout(() => runAutoEvents(scene, spawn, token), 520);
    if (scene.events.some((e) => e.chapter === chapterName(prev.chapter))) {
      // chapter is already correct; no forced jump.
    }
  }, [currentData, mutate, runAutoEvents, spawnFor]);

  const loadSceneByName = useCallback((name: string, tag: string | undefined, type: number) => {
    const current = snapRef.current;
    if (type === 3 && current.previousLevel) {
      const back = returnPosRef.current;
      loadScene(
        current.previousLevel,
        tag,
        true,
        back && back.level === current.previousLevel
          ? { x: back.x, y: back.y, dir: back.dir }
          : null,
      );
      returnPosRef.current = null;
      return;
    }
    const target = chooseScene(name, tag);
    if (!target) {
      toast(`找不到场景：${name}`);
      return;
    }
    loadScene(target.level, tag);
  }, [chooseScene, loadScene, toast]);

  /* ------------------------------------------------------------------ */
  /* Dialogue                                                            */
  /* ------------------------------------------------------------------ */

  const talk = useCallback(async (name: string, profile: string | null, text: string, ask = false) => {
    return new Promise<boolean>((resolve) => {
      dialogResolve.current = resolve;
      mutate((s) => ({ ...s, dialogue: { name, profile, text, ask, choice: 0 } }));
    });
  }, [mutate]);

  const finishDialogue = useCallback((value: boolean) => {
    const resolve = dialogResolve.current;
    dialogResolve.current = null;
    // 关闭对话的那一次确认键不应立刻又去调查旁边的 NPC / 事件。
    suppressInteractUntil.current = performance.now() + 150;
    mutate((s) => ({ ...s, dialogue: null }));
    resolve?.(value);
  }, [mutate]);

  const dialogueRole = useCallback((roleId: number, ev: SceneEvent | null) => {
    const leader = snapRef.current.party[0];
    if (roleId === -1) return { name: leader?.name ?? "刘备", profile: leader?.profile ?? "刘备" };
    if (roleId === -100) return { name: "话外音", profile: null };
    if (ev && roleId >= 0 && roleId < ev.names.length) return ev.names[roleId];
    if (ev && ev.names.length > 0) return ev.names[0];
    return { name: leader?.name ?? "刘备", profile: leader?.profile ?? null };
  }, []);

  /* ------------------------------------------------------------------ */
  /* Battle                                                              */
  /* ------------------------------------------------------------------ */

  const makeBattleUnits = useCallback((configEnemies: string[], formation: string, battleName?: string) => {
    const d = currentData();
    const s = snapRef.current;
    const ch = d.content.chapters.find((c) => c.id === s.chapter) ?? d.content.chapters[0];
    const battleStats = battleName ? d.content.enemyStats?.[battleName] : undefined;
    const players: BattleUnit[] = s.party.filter((m) => !m.dead).map((m, index) => {
      const st = memberCombatStats(m);
      const c = d.characters.get(m.name);
      const weapon = m.equipment[0] ? d.equipment.get(m.equipment[0]) : null;
      const weaponType = weapon?.weaponType ?? c?.weapon ?? 1;
      const skills = memberSkillsAtLevel(m, s.level);
      return {
        key: `p${index}`,
        side: "player",
        name: m.name,
        profile: m.profile,
        model: m.model,
        hp: m.hp,
        maxHp: m.maxHp,
        str: st.str,
        ler: st.ler,
        spd: st.spd,
        atk: st.atk,
        def: st.def,
        mp: c?.stats[1] ?? 0,
        weaponBits: c?.weapon ?? 0,
        terrainBits: c?.terrain ?? 0,
        skills,
        defending: false,
        attackTimes: weapon?.attackCount ?? ((weaponType & 16) !== 0 ? 2 : 1),
        hitRate: 92,
        critRate: c?.critRate ?? 10,
        critPower: c?.critPower ?? 1.2,
      };
    });
    const enemies: BattleUnit[] = configEnemies.map((name, index) => {
      const real = battleStats?.[index] ?? null;
      const characterName = real?.character ?? name;
      const c = d.characters.get(characterName) ?? d.characters.get(name);
      const hpList = ch?.hpList ?? [];
      const chapterHp = hpList.length > 1
        ? hpList[Math.floor(Math.random() * (hpList.length - 1))]
        : (hpList[0] ?? 180);
      const maxHp = real && real.maxHp >= 0 ? real.maxHp : (real ? chapterHp : Math.max(chapterHp, hpFor(c, d.hpLevels, s.level)));
      const skillNames = (c?.skills ?? []).filter((sk) => (d.skills.get(sk)?.lv ?? 99) <= 3).slice(0, 4);
      const str = c?.stats[4] ?? ch?.str ?? 55;
      const ler = c?.stats[5] ?? ch?.ler ?? 30;
      const spd = c?.stats[6] ?? ch?.spd ?? 30;
      return {
        key: `e${index}`,
        side: "enemy",
        name: real?.name ?? (name || "兵士"),
        profile: c?.profile ?? characterName,
        model: real?.model ?? c?.modelTexture ?? null,
        hp: maxHp,
        maxHp,
        str,
        ler,
        spd,
        atk: real && real.atk >= 0 ? real.atk : (c?.stats[2] || ch?.attack || 15),
        def: real && real.def >= 0 ? real.def : (c?.stats[3] || ch?.defense || 10),
        mp: c?.stats[1] ?? 0,
        weaponBits: c?.weapon ?? 0,
        terrainBits: c?.terrain ?? 0,
        skills: skillNames,
        defending: false,
        attackTimes: ((c?.weapon ?? 0) & 16) !== 0 ? 2 : 1,
        hitRate: 92,
        critRate: c?.critRate ?? 10,
        critPower: c?.critPower ?? 1.2,
      };
    });
    return { players, enemies, formation };
  }, [currentData, memberCombatStats, memberSkillsAtLevel]);

  const battlePrompt = useCallback((unit: BattleUnit, menu: BattleState["menu"] = "command", skill: string | null = null) => {
    return new Promise<BattleAction>((resolve) => {
      battleResolve.current = resolve;
      mutate((s) => {
        if (!s.battle) return s;
        const aliveEnemies = s.battle.units.filter((u) => u.side === "enemy" && u.hp > 0).length;
        const alivePlayers = s.battle.units.filter((u) => u.side === "player" && u.hp > 0).length;
        let title = `${unit.name} 的行动`;
        if (menu === "attack") title = `攻击目标（敌 ${aliveEnemies}）`;
        if (menu === "skill") title = `${unit.name} 的计策`;
        if (menu === "item") title = "使用物品";
        if (menu === "general") title = "武将";
        if (menu === "target") title = "选择目标";
        return {
          ...s,
          battle: { ...s.battle, pending: unit.key, menu, cursor: 0, skill, menuTitle: title, log: [`${unit.name} 待命`, ...s.battle.log].slice(0, 8) },
        };
      });
    });
  }, [mutate]);

  const aliveCountsRef = useRef({ players: 0, enemies: 0 });

  const finishBattle = useCallback((result: number) => {
    battleLoopResolve.current?.(result);
    battleLoopResolve.current = null;
  }, []);

  /** 战斗结算卡：键盘 J/K 与鼠标点击走同一条关闭路径。 */
  const continueBattleOutcome = useCallback(() => {
    const resolve = battleEndResolve.current;
    battleEndResolve.current = null;
    resolve?.();
  }, []);

  /** 全军覆没卡：回到标题并清掉本场残留，键盘与点击都可离开。 */
  const leaveGameOver = useCallback(() => {
    mutate((prev) => ({ ...prev, screen: "title", scene: null, party: [], battle: null, gameoverReason: "" }));
  }, [mutate]);

  const runBattle = useCallback(async (enemyNames: string[], config?: { money?: number; exp?: number; name?: string }) => {
    const s = snapRef.current;
    const battleNames = enemyNames.length ? enemyNames : ["兵士", "兵士"];
    const { players, enemies } = makeBattleUnits(battleNames, s.formation, config?.name);
    const units = [...players, ...enemies];
    const battleDef = config?.name
      ? (dataRef.current?.content.battles.find((b) => b.name === config.name) as { terrain?: number } | undefined)
      : undefined;
    locked.current = true;
    gameAudio.play("encounter");
    mutate((prev) => ({
      ...prev,
      screen: "battle",
      battle: {
        units: units.map((u) => ({ ...u })),
        round: 1,
        log: [`${battleNames[0]} 出现了`],
        pending: null,
        menu: "command",
        cursor: 0,
        skill: null,
        menuTitle: "",
        intro: true,
        terrain: battleTerrainAsset(battleDef?.terrain),
        bgm: kongmingBattleBgm(config?.name),
        fx: null,
      },
    }));

    for (const name of [...new Set(battleNames)]) {
      mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, log: [`${name} 出现了`] } } : prev);
      await sleep(420);
    }
    await sleep(260);
    mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, intro: false, log: ["战斗开始"] } } : prev);
    await sleep(240);

    const resultPromise = new Promise<number>((resolve) => { battleLoopResolve.current = resolve; });
    const formation = dataRef.current?.formations.get(s.formation);
    let round = 1;
    let finished = false;
    let fled = false;
    let allOut = false;

    const updateUnits = (nextUnits: BattleUnit[]) => {
      aliveCountsRef.current = {
        players: nextUnits.filter((u) => u.side === "player" && u.hp > 0).length,
        enemies: nextUnits.filter((u) => u.side === "enemy" && u.hp > 0).length,
      };
      mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, units: nextUnits.map((u) => ({ ...u })), round } } : prev);
    };

    const addLog = (line: string) => {
      mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, log: [line, ...prev.battle.log].slice(0, 8) } } : prev);
    };

    const unitIndex = (u: BattleUnit) => {
      const n = Number(u.key.slice(1));
      return Number.isFinite(n) ? n : 0;
    };
    const formationMag = (u: BattleUnit) => {
      if (u.side !== "player") return { attack: 1, getHurt: 1 };
      const mag = formation?.flatMags?.[unitIndex(u)];
      return { attack: mag?.attack ?? 1, getHurt: mag?.getHurt ?? 1 };
    };

    /** 原版 Hit.AttackDamage：离散 0.8/0.9/1.0/1.1/1.2，暴击倍率，防御减半。 */
    const damageOf = (attacker: BattleUnit, defender: BattleUnit, opts?: { crit?: boolean; hitIndex?: number }) => {
      const level = snapRef.current.level;
      const atk = Math.max(1, attacker.atk);
      const str = Math.max(1, attacker.str);
      const hp = Math.min(65535, Math.max(0, attacker.hp));
      const def = Math.max(4, defender.def);
      const variance = [0.8, 0.9, 1.0, 1.1, 1.2][Math.floor(Math.random() * 5)] ?? 1;
      const critPower = opts?.crit ? attacker.critPower * ((opts.hitIndex ?? 0) % 2 === 0 ? 1.2 : 1.0) : 1;
      const guard = defender.defending ? 0.5 : 1;
      const attackMag = formationMag(attacker).attack;
      const hurtMag = formationMag(defender).getHurt;
      const base = attacker.side === "player"
        ? (atk * str * hp) * 20 / def * (1 + level / 100)
        : (atk * str * hp) * 10 / (def + level);
      return Math.max(1, Math.floor((base * variance * critPower * attackMag * hurtMag * guard) / 10000));
    };

    const skillDamage = (attacker: BattleUnit, defender: BattleUnit, sk: SkillData) => {
      if (sk.damageCoef > 0) {
        const raw = (sk.damageCoef * attacker.ler) / 3200;
        return Math.max(1, Math.round(raw * (0.85 + Math.random() * 0.3) * (1 + attacker.hp / Math.max(1, attacker.maxHp))));
      }
      return damageOf(attacker, defender, { crit: false });
    };

    const hpAfter = (u: BattleUnit, nextHp: number): BattleUnit => ({ ...u, hp: clamp(Math.round(nextHp), 0, u.maxHp) });

    /**
     * 桌面版 `BattleCharacterMono.AttackAction`：按 `AttackSprites` 顺序每帧
     * 停 0.15s，播完恢复待机。这里把帧号挂到 battle.fx，由渲染层换图。
     */
    const setBattleFx = (fx: BattleFx | null) => {
      mutate((prev) => (prev.battle ? { ...prev, battle: { ...prev.battle, fx } } : prev));
    };

    const playAttackFx = async (actor: BattleUnit, target: BattleUnit) => {
      const sequence = attackSequenceForModel(actor.model);
      if (sequence.length === 0) return;
      const speed = Math.max(0.5, snapRef.current.speed);
      setBattleFx({ actor: actor.key, target: null, frame: null, hurt: false });
      for (const frame of sequence) {
        setBattleFx({ actor: actor.key, target: target.key, frame, hurt: false });
        await sleep(150 / speed);
      }
      setBattleFx(null);
    };

    /** 原版 `GetHurtShake`：受击方 +0.05 → -0.05 → 回正，共 9 帧。 */
    const playHurtFx = async (target: BattleUnit) => {
      const speed = Math.max(0.5, snapRef.current.speed);
      setBattleFx({ actor: null, target: target.key, frame: null, hurt: true });
      await sleep(150 / speed);
      setBattleFx(null);
    };

    /** 原版 AttackExecuteCommand：按武器 AttackTimes 连击，92% 命中、暴击、防御减半。 */
    const performAttack = async (attacker: BattleUnit, target: BattleUnit) => {
      const attackTimes = Math.max(1, attacker.attackTimes);
      for (let hitIndex = 0; hitIndex < attackTimes; hitIndex++) {
        if (finished || !target || target.hp <= 0) break;
        await playAttackFx(attacker, target);
        const isMiss = Math.random() * 100 >= attacker.hitRate;
        if (isMiss) {
          gameAudio.play("miss");
          addLog(`${attacker.name} 攻击 ${target.name}，失败`);
          await sleep(180 / Math.max(0.5, snapRef.current.speed));
          continue;
        }
        const isCrit = Math.random() * 100 < attacker.critRate;
        const dmg = damageOf(attacker, target, { crit: isCrit, hitIndex });
        const real = Math.min(dmg, target.hp);
        Object.assign(target, hpAfter(target, target.hp - dmg));
        gameAudio.play(isCrit ? "crit" : "hit");
        if (target.hp <= 0) gameAudio.play("down");
        updateUnits(units);
        await playHurtFx(target);
        addLog(`${attacker.name}${isCrit ? (attacker.side === "player" ? "奋战" : "苦战") : ""} 攻击 ${target.name}，歼敌 ${real}`);
        updateUnits(units);
        await sleep(220 / Math.max(0.5, snapRef.current.speed));
      }
    };


    while (!finished) {
      round;
      const commands = new Map<string, BattleAction>();
      let retreatAttempted = false;
      for (const u of units) u.defending = false;

      // 原版 SelectPlayerCommands：全队按队伍顺序选完指令，之后才统一结算。
      if (!allOut) {
        const selectable = units.filter((u) => u.side === "player" && u.hp > 0);
        for (const current of selectable) {
          if (finished) break;
          updateUnits(units);
          const action = await battlePrompt(current, "command");
          if (action.type === "offensive") {
            allOut = true;
            break;
          }
          if (action.type === "flee") {
            retreatAttempted = true;
            if (Math.random() < 0.35) {
              gameAudio.play("flee");
              addLog("全军撤退成功");
              fled = true;
              finished = true;
            } else {
              gameAudio.play("lose");
              addLog("撤退失败");
            }
            break;
          }
          commands.set(current.key, action);
        }
      }

      if (finished) break;

      // 原版 ExecuteCommands：TurnSpd = 速度 + [-15,16]，统一降序执行。
      const order = units
        .filter((u) => u.hp > 0)
        .map((u) => ({ u, turnSpd: u.spd + Math.floor(Math.random() * 31) - 15 }))
        .sort((a, b) => b.turnSpd - a.turnSpd);

      for (const { u: acting } of order) {
        if (finished) break;
        const current = units.find((u) => u.key === acting.key);
        if (!current || current.hp <= 0) continue;
        if (current.side === "player") {
          if (retreatAttempted) continue;
          const action: BattleAction | undefined = allOut ? { type: "attack" } : commands.get(current.key);
          if (!action) continue;
          if (action.type === "attack") {
            const chosen = units.find((u) => u.key === action.target && u.side === "enemy" && u.hp > 0);
            const target = chosen ?? units.filter((u) => u.side === "enemy" && u.hp > 0)[0];
            if (target) await performAttack(current, target);
          } else if (action.type === "defend") {
            current.defending = true;
            gameAudio.play("guard");
            updateUnits(units);
            addLog(`${current.name} 防御`);
          } else if (action.type === "skill" && action.skill) {
            const sk = dataRef.current?.skills.get(action.skill);
            if (sk) {
              const cost = sk.cost;
              if (snapRef.current.mp >= cost) {
                mutate((prev) => ({ ...prev, mp: prev.mp - cost }));
                gameAudio.play(sk.heal || sk.resurrect ? "heal" : "cast");
                if (sk.heal || sk.resurrect) {
                  const target = units.filter((u) => u.side === "player" && u.hp > 0);
                  const heal = Math.max(40, Math.round((sk.damageCoef || 800) * current.ler / 2400));
                  const one = action.target ? units.find((u) => u.key === action.target) : target[0];
                  if (one) {
                    Object.assign(one, hpAfter(one, one.hp + heal));
                    addLog(`${current.name} 使用 ${sk.name}，${one.name} 恢复 ${heal}`);
                  }
                } else {
                  const targets = sk.targetScope > 1 ? units.filter((u) => u.side === "enemy" && u.hp > 0) : [units.find((u) => u.key === action.target)].filter(Boolean) as BattleUnit[];
                  for (const t of targets) {
                    const dmg = skillDamage(current, t as BattleUnit, sk);
                    Object.assign(t, hpAfter(t as BattleUnit, (t as BattleUnit).hp - dmg));
                    addLog(`${current.name} 施放 ${sk.name}，${(t as BattleUnit).name} 损失 ${dmg}`);
                  }
                }
              } else {
                addLog("谋略点不足，行动取消");
              }
            }
          } else if (action.type === "item" && action.item) {
            const itemName = action.item;
            const target = units.find((u) => u.key === action.target) ?? units.find((u) => u.side === "player" && u.hp > 0);
            if (target) {
              const heal = itemName.includes("招魂") ? target.maxHp : 90 + snapRef.current.level * 12;
              Object.assign(target, hpAfter(target, itemName.includes("招魂") ? target.maxHp : target.hp + heal));
              addLog(`${current.name} 使用 ${itemName}，${target.name} 恢复 ${Math.min(heal, target.maxHp)}`);
              consumeInventory(itemName);
            }
          }
        } else {
          await sleep(240 / Math.max(0.5, snapRef.current.speed));
          const alivePlayers = units.filter((u) => u.side === "player" && u.hp > 0);
          if (alivePlayers.length === 0) break;
          const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
          const skill = current.skills.find((name) => (dataRef.current?.skills.get(name)?.cost ?? 99) <= 4 && Math.random() < 0.25);
          if (skill) {
            const sk = dataRef.current?.skills.get(skill);
            if (sk) {
              if (sk.heal) {
                const enemy = units.filter((u) => u.side === "enemy" && u.hp > 0)[0];
                if (enemy) {
                  const heal = Math.max(20, Math.round((sk.damageCoef || 800) * current.ler / 2600));
                  Object.assign(enemy, hpAfter(enemy, enemy.hp + heal));
                  addLog(`${current.name} 使用 ${sk.name}，${enemy.name} 恢复 ${heal}`);
                }
              } else {
                const dmg = skillDamage(current, target, sk);
                Object.assign(target, hpAfter(target, target.hp - dmg));
                addLog(`${current.name} 施放 ${sk.name}，${target.name} 损失 ${dmg}`);
              }
            }
          } else {
            await performAttack(current, target);
          }
        }
        updateUnits(units);
        await sleep(allOut ? 180 / Math.max(0.5, snapRef.current.speed) : 300 / Math.max(0.5, snapRef.current.speed));
        const alivePlayers = units.filter((u) => u.side === "player" && u.hp > 0).length;
        const aliveEnemies = units.filter((u) => u.side === "enemy" && u.hp > 0).length;
        if (alivePlayers === 0 || aliveEnemies === 0) {
          finished = true;
          break;
        }
      }
      if (finished) break;
      round++;
      for (const u of units) u.defending = false;
      updateUnits(units);
    }

    const win = units.some((u) => u.side === "player" && u.hp > 0) && !units.some((u) => u.side === "enemy" && u.hp > 0);
    const won = !fled && win;
    const escaped = fled;
    gameAudio.play(escaped ? "flee" : won ? "win" : "lose");
    const partyAfter = snapRef.current.party.map((m) => {
      const u = units.find((x) => x.side === "player" && x.name === m.name);
      if (!u) return m;
      return { ...m, hp: u.hp, maxHp: u.maxHp, dead: u.hp <= 0 };
    });
    const rewardMoney = won ? Math.max(20, (config?.money && config.money > 0 ? config.money : 0) + 30 + snapRef.current.level * 4) : 0;
    const rewardExp = won ? Math.max(12, config?.exp && config.exp > 0 ? config.exp : 8 + snapRef.current.level * 2) : 0;
    const leveled = rewardExp > 0
      ? addExp(rewardExp, snapRef.current.level, snapRef.current.exp)
      : { level: snapRef.current.level, exp: snapRef.current.exp, skills: [] as string[], formations: [] as string[] };
    const learned = [...leveled.skills, ...leveled.formations].filter((name, i, all) => all.indexOf(name) === i);
    const partyLevel = partyAfter.map((m) => {
      const updated = recalcHp(m, leveled.level);
      return { ...updated, level: leveled.level, skills: memberSkillsAtLevel(updated, leveled.level) };
    });
    const outcomeTitle = config?.name?.replace(/^\d+-/, "") || "遭遇战";
    const ended = new Promise<void>((resolve) => { battleEndResolve.current = resolve; });
    mutate((prev) => ({
      ...prev,
      party: partyLevel,
      level: leveled.level,
      exp: leveled.exp,
      money: prev.money + rewardMoney,
      battle: prev.battle ? {
        ...prev.battle,
        pending: null,
        menu: "command",
        result: won ? "win" : "lose",
        outcome: { kind: escaped ? "flee" : won ? "win" : "lose", title: outcomeTitle, money: rewardMoney, exp: rewardExp, level: leveled.level, learned },
      } : null,
      log: [...prev.log, `${outcomeTitle}${escaped ? "撤退" : won ? "胜利" : "失败"}`].slice(-30),
    }));
    await ended;
    const result = escaped ? 0 : won ? 1 : 0;
    mutate((prev) => ({
      ...prev,
      screen: escaped || won ? "field" : "gameover",
      battle: null,
      gameoverReason: escaped || won ? "" : "全军覆没",
      toast: won ? `战斗胜利　获得 ${rewardMoney} 金、${rewardExp} 经验` : escaped ? "全军撤退" : "",
    }));
    await sleep(300);
    locked.current = false;
    finishBattle(result);
    return result;
  }, [addExp, battlePrompt, finishBattle, makeBattleUnits, memberSkillsAtLevel, mutate, recalcHp]);

  /**
   * 原版 TeamMove.CheckMeetEnemy：每走一格 MeetStep++；超过 30 格后按
   * min(MeetStep, MeetEnemyRatio) / 100 的概率遇敌，超过 90 格必遇。
   * Special 格（事件/传送点）不计遇敌。仅野外与洞窟参与。
   */
  const tryEncounter = useCallback((scene: Scene, x: number, y: number) => {
    if (!scene.isWorld && !scene.isCave) return false;
    const s = snapRef.current;
    const step = s.meetStep + 1;
    mutate((prev) => ({ ...prev, meetStep: step }));
    const special =
      scene.events.some((e) => {
        const walk = npcWalkRef.current[e.id];
        const p = walk ? [walk.x, walk.y] : s.eventPos[e.id] ?? e.pos;
        return dist(p[0], p[1], x, y) < 0.8;
      }) ||
      scene.transitions.some((t) => dist(t.pos[0], t.pos[1], x, y) < 0.8);
    if (special) return false;
    if (step > 30 && Math.random() * 100 < Math.min(step, 5)) {
      mutate((prev) => ({ ...prev, meetStep: 0 }));
      const d = currentData();
      const ch = d.content.chapters.find((c) => c.id === s.chapter) ?? d.content.chapters[0];
      const alive = Math.max(1, s.party.filter((m) => !m.dead).length);
      const roll = Math.floor(Math.random() * 100);
      let offset = -2;
      if (roll >= 85) offset = 2;
      else if (roll >= 65) offset = 1;
      else if (roll >= 35) offset = 0;
      else if (roll >= 15) offset = -1;
      const count = clamp(alive + offset, 1, 5);
      const pool = [...(ch?.generals ?? [])];
      const picked: string[] = [];
      if (pool.length > 0 && Math.floor(Math.random() * 4) !== 0) {
        for (let i = 0; i < count && pool.length > 0; i++) {
          if (Math.floor(Math.random() * 4) === 0) {
            const idx = Math.floor(Math.random() * pool.length);
            picked.push(pool[idx]);
            pool.splice(idx, 1);
          }
        }
      }
      const terrain = scene.terrain ?? 2;
      let generic = terrain & 8 ? "海贼" : terrain & 0x14 ? "山贼" : "兵士";
      if (generic === "兵士" && ch && Math.random() * 100 < (ch.solidRatio ?? 0)) generic = ch.changeTo ?? generic;
      const enemies = [...picked];
      while (enemies.length < count) enemies.push(generic);
      void runBattle(enemies);
      return true;
    }
    return false;
  }, [currentData, mutate, runBattle]);

  const consumeInventory = useCallback((name: string) => {
    mutate((prev) => {
      const inv = prev.inventory.map((slot) => ({ ...slot }));
      const item = inv.find((i) => i.name === name);
      if (!item) return prev;
      item.count--;
      return { ...prev, inventory: inv.filter((i) => i.count > 0) };
    });
  }, [mutate]);

  /* ------------------------------------------------------------------ */
  /* Lua host                                                            */
  /* ------------------------------------------------------------------ */

  const luaBusy = useRef(false);

  const executeLua = useCallback(async (ev: SceneEvent | null) => {
    const d = currentData();
    if (!ev?.id) return false;
    if (ev.id === COUPON_EVENT_ID) {
      await talk("券商", "券商", "欢迎光临券房。孔明券、军资换 tcr，都在这里办。");
      openCouponRef.current?.();
      return true;
    }
    const source = d.lua[`${ev.id}.lua`];
    if (!source) {
      if (ev.names.length) await talk(ev.names[0].name, ev.names[0].profile, "……");
      return false;
    }
    const leader = () => snapRef.current.party[0];
    const addFlag = (key: string) => mutate((prev) => ({ ...prev, flags: { ...prev.flags, [key]: true } }));
    const setEventPosition = (x: number, y: number) => {
      if (!ev?.id) return;
      mutate((prev) => ({ ...prev, eventPos: { ...prev.eventPos, [ev.id]: [x, y] } }));
    };
    const moveCurrentEvent = async (positions: number[][]) => {
      if (!ev?.id) return;
      for (const target of positions) {
        if (!target || target.length < 2) continue;
        const start = snapRef.current.eventPos[ev.id] ?? [ev.pos[0], ev.pos[1]];
        const tx = Number(target[0]);
        const ty = Number(target[1]);
        const span = Math.hypot(tx - start[0], ty - start[1]);
        const duration = Math.min(900, Math.max(120, span * 65));
        const began = performance.now();
        await new Promise<void>((resolve) => {
          const tick = (now: number) => {
            const t = Math.min(1, (now - began) / duration);
            setEventPosition(start[0] + (tx - start[0]) * t, start[1] + (ty - start[1]) * t);
            if (t < 1) requestAnimationFrame(tick);
            else resolve();
          };
          requestAnimationFrame(tick);
        });
        setEventPosition(tx, ty);
      }
    };
    const applySceneByTag = async (type: number, name: string, tag?: string) => {
      loadSceneByName(name, tag, type);
      await sleep(280);
    };
    const host = {
      env: new Map<string, unknown>(),
      call: async (name: string, args: unknown[]): Promise<unknown> => {
        const s = snapRef.current;
        switch (name) {
          case "Talk": {
            const role = dialogueRole(Number(args[0]), ev);
            const content = String(args[1] ?? "");
            await talk(role.name, role.profile, content, false);
            return true;
          }
          case "TalkAsk": {
            const role = dialogueRole(Number(args[0]), ev);
            const content = String(args[1] ?? "");
            return talk(role.name, role.profile, content, true);
          }
          case "FinishCurrentEvent": {
            if (ev?.id) addFlag(ev.id);
            return undefined;
          }
          case "FinishEvents":
          case "FinishEventsAsync": {
            for (const key of flattenArgs(args)) if (key) addFlag(String(key));
            return undefined;
          }
          case "HasEvent":
            return !!s.flags[String(args[0])];
          case "HasCurrentEvent":
            return !!s.flags[ev?.id ?? ""];
          case "HasEvents":
            return flattenArgs(args).every((k) => !!s.flags[String(k)]);
          case "Battle": {
            const index = Number(args[0] ?? 0);
            const battleName = ev?.battles[index] ?? ev?.battles[0];
            const config = battleName ? d.battles.get(battleName) : undefined;
            const result = await runBattle(config?.enemies ?? ["兵士", "兵士"], {
              money: config?.money,
              exp: config?.exp,
              name: config?.name ?? battleName,
            });
            return result;
          }
          case "BattleCount":
            return ev?.battles.length ?? 0;
          case "AddRole": {
            const ids = flattenArgs(args).map(Number).filter((n) => Number.isFinite(n) && n > 0);
            const found: Member[] = [];
            const slots = Math.max(0, 5 - s.party.length);
            for (const id of ids) {
              if (found.length >= slots) break;
              const c = [...d.characters.values()].find((x) => x.id === id);
              if (!c) continue;
              if (snapRef.current.party.some((m) => m.name === c.name)) continue;
              if (found.some((m) => m.name === c.name)) continue;
              const m = makeMember(c.name, s.level, d);
              if (m) found.push(m);
            }
            if (found.length) {
              const equipped = autoEquip([...s.party, ...found], s.inventory, false);
              mutate((prev) => ({ ...prev, party: equipped.party, inventory: equipped.inventory }));
            }
            return undefined;
          }
          case "RemoveRole": {
            const ids = flattenArgs(args).map(Number);
            mutate((prev) => ({ ...prev, party: prev.party.filter((m) => !ids.includes(m.id)) }));
            return undefined;
          }
          case "TeamInitRoles": {
            const groups = args.map((a) => (Array.isArray(a) ? a.map(Number) : [])) as number[][];
            const allIds = [...(groups[0] ?? []), ...(groups[1] ?? [])];
            const next: Member[] = [];
            for (const id of allIds) {
              const c = [...d.characters.values()].find((x) => x.id === id);
              if (!c) continue;
              const m = makeMember(c.name, s.level, d);
              if (m && !next.some((n) => n.name === m.name)) next.push(m);
            }
            mutate((prev) => ({ ...prev, party: next.length ? next : prev.party }));
            return undefined;
          }
          case "TeamInitCurrentCharacters": {
            const ids = flattenArgs(args).map(Number).filter((n) => Number.isFinite(n));
            if (ids.length === 0) return undefined;
            const next: Member[] = [];
            for (const id of ids) {
              const c = [...d.characters.values()].find((x) => x.id === id);
              if (!c) continue;
              const m = makeMember(c.name, s.level, d);
              if (m && !next.some((n) => n.name === m.name)) next.push(m);
            }
            mutate((prev) => ({ ...prev, party: next.length ? next : prev.party }));
            return undefined;
          }
          case "SetActive":
          case "SetTeamActive":
          case "SetCameraTeamMode":
          case "SetCameraFreeMode":
          case "SetCameraFollowNPC":
          case "SetSpeed":
          case "ChangeDirection":
          case "TeamChangeDirection":
          case "SetNPCModel":
          case "SwitchAudio":
          case "PlayAudio":
          case "SetCamera":
          case "ShakeCamera":
          case "SetTeamBoatPosition":
          case "AddAlternateRole":
          case "AddNPCRole":
          case "ClearTempCharacters":
          case "AddTempCharacterById":
          case "AddCurrentCharacterFromTempById":
          case "AddCurrentCharacterFromTempByOrder":
          case "SetCameraFollowNPC2":
          case "FinishEventsNextFrame":
            return undefined;
          case "EndTalk":
          case "StartTalk":
            return undefined;
          case "MoveTo":
          case "MoveToAsync":
          case "BoatMoveTo": {
            const positions = flattenArgs(args).filter((x) => Array.isArray(x)) as number[][];
            await moveCurrentEvent(positions);
            return undefined;
          }
          case "TeamMoveTo": {
            const positions = flattenArgs(args).filter((x) => Array.isArray(x)) as number[][];
            const last = positions[positions.length - 1];
            if (last && last.length >= 2) mutate((prev) => ({ ...prev, x: last[0], y: last[1] }));
            return undefined;
          }
          case "TeamQuickMoveTo":
          case "QuickMoveTo": {
            const pos = args.find((a) => Array.isArray(a)) as number[] | undefined;
            if (pos && pos.length >= 2) mutate((prev) => ({ ...prev, x: Number(pos[0]), y: Number(pos[1]) }));
            return undefined;
          }
          case "SetPosition": {
            const pos = args.find((a) => Array.isArray(a)) as number[] | undefined;
            if (pos && pos.length >= 2) setEventPosition(Number(pos[0]), Number(pos[1]));
            return undefined;
          }
          case "SetTeamPosition":
            return undefined;
          case "TeamPosition":
            return [s.x, s.y];
          case "TeamDirection":
            return s.dir[0] < 0 ? 2 : s.dir[0] > 0 ? 3 : s.dir[1] > 0 ? 0 : 1;
          case "SetEvent": {
            const key = String(args[0] ?? "");
            if (key) mutate((prev) => ({ ...prev, flags: { ...prev.flags, [key]: true } }));
            return undefined;
          }
          case "HasItem": {
            const idOrName = args[0];
            const count = Number(args[1] ?? 1);
            const nameStr = typeof idOrName === "number"
              ? d.content.items.find((i) => i.id === idOrName)?.name
              : String(idOrName);
            return (s.inventory.find((i) => i.name === nameStr)?.count ?? 0) >= count;
          }
          case "AddItem": {
            const idOrName = args[0];
            const count = Number(args[1] ?? 1);
            const itemName = typeof idOrName === "number" ? d.content.items.find((i) => i.id === idOrName)?.name : String(idOrName);
            if (itemName) mutate((prev) => {
              const inv = prev.inventory.map((i) => ({ ...i }));
              const hit = inv.find((i) => i.name === itemName);
              if (hit) hit.count += count; else inv.push({ name: itemName, count });
              return { ...prev, inventory: inv };
            });
            return undefined;
          }
          case "RemoveItem": {
            const idOrName = args[0];
            const count = Number(args[1] ?? 1);
            const itemName = typeof idOrName === "number" ? d.content.items.find((i) => i.id === idOrName)?.name : String(idOrName);
            if (itemName) mutate((prev) => {
              const inv = prev.inventory.map((i) => ({ ...i }));
              const hit = inv.find((i) => i.name === itemName);
              if (hit) hit.count -= count;
              return { ...prev, inventory: inv.filter((i) => i.count > 0) };
            });
            return undefined;
          }
          case "HasMoney":
            return s.money >= Number(args[0] ?? 0);
          case "AddMoney":
            mutate((prev) => ({ ...prev, money: prev.money + Number(args[0] ?? 0) }));
            return undefined;
          case "HasLv":
            return s.level >= Number(args[0] ?? 0);
          case "HasRole": {
            const id = Number(args[0]);
            return s.party.some((m) => m.id === id);
          }
          case "TeamCharactersId":
            return s.party.map((m) => m.id);
          case "TeamCharactersCount":
            return s.party.filter((m) => {
              const type = Number(args[0] ?? 0);
              return type === 0 || (type === 1 && !m.dead) || (type === 2 && m.dead);
            }).length;
          case "TeamCharactersHasRole": {
            const ids = flattenArgs(args).map(Number);
            return ids.every((id) => s.party.some((m) => m.id === id));
          }
          case "Rest": {
            const money = Number(args[0] ?? 0);
            const resurrect = Boolean(args[2]);
            mutate((prev) => ({
              ...prev,
              money: Math.max(0, prev.money - money),
              activityConsumeGold: (prev.activityConsumeGold ?? 0) + Math.min(prev.money, Math.max(0, money)),
              party: prev.party.map((m) => ({ ...m, hp: resurrect || !m.dead ? m.maxHp : m.hp, dead: resurrect ? false : m.dead })),
            }));
            return undefined;
          }
          case "InitTeamStatus":
            mutate((prev) => ({ ...prev, party: prev.party.map((m) => ({ ...m, hp: m.maxHp, dead: false })) }));
            return undefined;
          case "Train": {
            const targetLv = Number(args[0] ?? s.level);
            const money = Number(args[1] ?? 0);
            mutate((prev) => ({
              ...prev,
              level: targetLv,
              money: Math.max(0, prev.money - money),
              activityConsumeGold: (prev.activityConsumeGold ?? 0) + Math.min(prev.money, Math.max(0, money)),
              party: prev.party.map((m) => recalcHp({ ...m, hp: m.maxHp }, targetLv)),
            }));
            return undefined;
          }
          case "Shop": {
            await openShopRef.current?.();
            return undefined;
          }
          case "ChangeScene": {
            const type = Number(args[0] ?? 0);
            const sceneName = String(args[1] ?? "");
            const tag = args[2] !== undefined ? String(args[2]) : undefined;
            await applySceneByTag(type, sceneName, tag);
            return undefined;
          }
          case "StartChapter": {
            const chapterId = Number(args[0] ?? 1);
            mutate((prev) => ({ ...prev, chapter: chapterId }));
            const ch = d.content.chapters.find((c) => c.id === chapterId);
            banner(`第${ch?.order ?? chapterId}章　${ch?.name ?? ""}`);
            return undefined;
          }
          case "GeneralName":
            return leader()?.name ?? "刘备";
          case "NextExp": {
            const row = d.content.exp.levels[s.level - 1];
            return row?.next ?? 0;
          }
          case "ParametersInScene": {
            const prev = d.scenes.find((x) => x.level === s.previousLevel && !isIndoorScene(x.name) && !x.name.includes("民房"));
            const key = prev?.name.trim() || s.scene?.name.trim() || "";
            const params = d.content.parameters?.[s.scene?.name.trim() ?? ""]?.[key];
            if (params && params.length > 0) return params.slice();
            return ["30"];
          }
          case "EventParameters":
            return (ev?.params ?? []).map(String);
          case "Fade":
            mutate((prev) => ({ ...prev, faded: Boolean(args[0]) }));
            await sleep(Number(args[1] ?? 0.2) * 1000);
            return undefined;
          case "Delay": {
            const ms = Math.min(2400, Number(args[0] ?? 0) * 1000);
            if (ms > 0) await sleep(ms);
            return undefined;
          }
          case "ShakeCamera":
            mutate((prev) => ({ ...prev, shake: true }));
            setTimeout(() => mutate((prev) => ({ ...prev, shake: false })), 500);
            return undefined;
          case "AlternateInScene":
            return undefined;
          case "BackToTitle":
            mutate((prev) => ({ ...prev, screen: "title", scene: null, battle: null, dialogue: null }));
            return undefined;
          case "TeamAddHp": {
            const value = Number(args[0] ?? 0);
            mutate((prev) => ({
              ...prev,
              party: prev.party.map((m) => ({
                ...m,
                hp: clamp(m.hp + (value < 1 ? m.maxHp * value : value), 1, m.maxHp),
                dead: false,
              })),
            }));
            return undefined;
          }
          case "SetTeamCharactersCount":
            return undefined;
          case "print":
            return undefined;
          case "pairs": {
            const obj = args[0];
            if (Array.isArray(obj)) return obj.map((v, i) => [i, v]);
            if (obj && typeof obj === "object") return Object.entries(obj as Record<string, unknown>);
            return [];
          }
          case "tonumber":
            return Number(args[0]);
          case "format":
            return String(args[0] ?? "");
          default:
            return undefined;
        }
      },
    };
    luaBusy.current = true;
    try {
      const runtime = new LuaRuntime(host, source);
      await runtime.run();
    } catch (error) {
      console.warn("Lua 脚本执行失败", ev.id, error);
      toast(`剧情脚本 ${ev.id} 执行出错`);
    } finally {
      luaBusy.current = false;
    }
    return true;
  }, [autoEquip, banner, currentData, dialogueRole, loadSceneByName, makeMember, mutate, recalcHp, runBattle, talk, toast]);

  const runEvent = useCallback(async (ev: SceneEvent) => {
    if (!ev.id) return;
    if (locked.current || luaBusy.current) return;
    if (snapRef.current.flags[ev.id] && ev.hideAfter) return;
    locked.current = true;
    activeEvent.current = ev;
    const s = snapRef.current;
    if (s.dialogue) await talk("", null, "", false).catch(() => null);
    try {
      await executeLua(ev);
    } finally {
      activeEvent.current = null;
      locked.current = false;
    }
  }, [executeLua, talk]);
  runEventRef.current = runEvent;

  const triggerOnEnter = useCallback(async (scene: Scene, x: number, y: number) => {
    if (locked.current) return;
    const s = snapRef.current;
    const guard = arrivalGuardRef.current;
    let arriving = false;
    if (guard && guard.level === scene.level) {
      if (dist(guard.x, guard.y, x, y) < guard.radius) arriving = true;
      else arrivalGuardRef.current = null;
    }
    const trans = arriving ? undefined : scene.transitions
      .filter((t) => {
        if (t.when !== 1) return false;
        // 城门是整排墙，原版铺的触发点带小数；放宽到一格半，避免必须踩中
        // 某个 0.1 格的精确点才能出门。
        const radius = t.scene === "大地图" ? 1.6 : 0.8;
        return dist(t.pos[0], t.pos[1], x, y) < radius;
      })
      .sort((a, b) => dist(a.pos[0], a.pos[1], x, y) - dist(b.pos[0], b.pos[1], x, y))[0];
    if (trans) {
      locked.current = true;
      loadSceneByName(trans.scene, trans.tag || undefined, trans.type);
      locked.current = false;
      return;
    }
    const chapter = chapterName(s.chapter);
    const ev = scene.events
      .filter((e) => (e.when === 1 || e.when === 3) && e.id && !s.flags[e.id] && eventVisible(e, s.flags, chapter) && dist(e.pos[0], e.pos[1], x, y) < 0.8)
      .sort((a, b) => dist(a.pos[0], a.pos[1], x, y) - dist(b.pos[0], b.pos[1], x, y))[0];
    if (ev) await runEvent(ev);
  }, [loadSceneByName, runEvent]);

  /* ------------------------------------------------------------------ */
  /* Shop                                                                */
  /* ------------------------------------------------------------------ */

  const openShop = useCallback(async () => {
    const d = currentData();
    const s = snapRef.current;
    const scene = s.scene?.name ?? "";
    const kind = scene.includes("武器") || scene.trim() === "武"
      ? "武器店"
      : scene.includes("道具") || scene.includes("道具店") || scene.trim() === "道"
        ? "道具店"
        : "";
    const prevScene = d.scenes.find((x) => x.level === s.previousLevel && !["武", "道具"].includes(x.name.trim()));
    const townText = `${scene} ${prevScene?.name ?? ""}`;
    const typed = kind ? d.content.shops.filter((x) => x.name.endsWith(kind)) : d.content.shops;
    let shop = typed.find((x) => {
      const town = x.name.split("-")[0];
      return town.length > 0 && townText.includes(town);
    });
    if (!shop) shop = typed.find((x) => townText.includes(x.name.split("-")[0]));
    if (!shop) shop = typed[0];
    if (!shop) shop = d.content.shops.find((x) => scene.includes(x.name.split("-")[0]));
    if (!shop) shop = d.content.shops[0];
    if (!shop) { toast("此处没有店铺"); return; }
    const items = shop.items.map((name) => {
      if (d.equipment.has(name)) return { name, price: d.equipment.get(name)!.price, kind: "equipment" as const };
      const item = d.items.get(name);
      return { name, price: item?.price ?? 50, kind: "item" as const };
    });
    mutate((prev) => ({ ...prev, shop: { title: shop!.name, items, cursor: 0 } }));
    return new Promise<void>((resolve) => { shopResolve.current = resolve; });
  }, [currentData, mutate]);

  openShopRef.current = openShop;

  const openCouponVendor = useCallback(() => {
    mutate((prev) => ({
      ...prev,
      coupon: {
        tab: "coupon",
        tickets: 0,
        gold: 0,
        busy: false,
        note: null,
        dailyGoldLeft: maxGoldPerTcrDaily,
      },
    }));
  }, [maxGoldPerTcrDaily, mutate]);
  openCouponRef.current = openCouponVendor;

  const closeCouponVendor = useCallback(() => {
    mutate((prev) => ({ ...prev, coupon: null }));
  }, [mutate]);

  const redeemCouponsAtVendor = useCallback(async (offerIndex: number) => {
    mutate((prev) => prev.coupon ? { ...prev, coupon: { ...prev.coupon, busy: true, note: null } } : prev);
    try {
      const result = await redeemKongmingGoldAction({ offerIndex });
      if (result.success) {
        setCouponTickets(result.remaining ?? Math.max(0, couponTickets - (result.tickets ?? 0)));
        mutate((prev) => ({
          ...prev,
          money: prev.money + (result.gold ?? 0),
          activityRechargeGold: (prev.activityRechargeGold ?? 0) + (result.gold ?? 0),
          coupon: prev.coupon ? {
            ...prev.coupon,
            busy: false,
            note: result.message,
          } : prev.coupon,
        }));
        toast(result.message);
      } else {
        mutate((prev) => prev.coupon ? {
          ...prev,
          coupon: { ...prev.coupon, busy: false, note: result.message },
        } : prev);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "兑换失败，请稍后重试";
      mutate((prev) => prev.coupon ? {
        ...prev,
        coupon: { ...prev.coupon, busy: false, note: message },
      } : prev);
    }
  }, [couponTickets, mutate, toast]);

  const exchangeTcrAtVendor = useCallback(async (offerIndex: number) => {
    mutate((prev) => prev.coupon ? { ...prev, coupon: { ...prev.coupon, busy: true, note: null } } : prev);
    try {
      const result = await exchangeKongmingGoldForTcrAction({ offerIndex });
      if (result.success && result.gold && result.gold > 0) {
        mutate((prev) => {
          const spent = result.gold ?? 0;
          const left = result.remainingGold ?? prev.coupon?.dailyGoldLeft ?? 0;
          const nextMoney = Math.max(0, prev.money - spent);
          return {
            ...prev,
            money: nextMoney,
            activityConsumeGold: (prev.activityConsumeGold ?? 0) + spent,
            coupon: prev.coupon ? {
              ...prev.coupon,
              busy: false,
              note: result.message,
              dailyGoldLeft: left,
            } : prev.coupon,
          };
        });
        toast(result.message);
      } else {
        mutate((prev) => prev.coupon ? {
          ...prev,
          coupon: {
            ...prev.coupon,
            busy: false,
            note: result.message,
            dailyGoldLeft: result.remainingGold ?? prev.coupon.dailyGoldLeft,
          },
        } : prev);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "兑换失败，请稍后重试";
      mutate((prev) => prev.coupon ? {
        ...prev,
        coupon: { ...prev.coupon, busy: false, note: message },
      } : prev);
    }
  }, [mutate, toast]);

  const closeShop = useCallback(() => {
    const resolve = shopResolve.current;
    shopResolve.current = null;
    mutate((prev) => ({ ...prev, shop: null }));
    resolve?.();
  }, [mutate]);

  const buyShopItem = useCallback((index: number) => {
    const d = currentData();
    const s = snapRef.current;
    const shop = s.shop;
    if (!shop) return;
    const entry = shop.items[index];
    if (!entry) return;
    if (s.money < entry.price) { toast("金钱不足"); return; }
    mutate((prev) => {
      const inv = prev.inventory.map((i) => ({ ...i }));
      const hit = inv.find((i) => i.name === entry.name);
      if (hit) hit.count++; else inv.push({ name: entry.name, count: 1 });
      return {
        ...prev,
        money: prev.money - entry.price,
        activityConsumeGold: (prev.activityConsumeGold ?? 0) + entry.price,
        inventory: inv,
      };
    });
    toast(`购入 ${entry.name}`);
    void d;
  }, [currentData, mutate, toast]);

  /* ------------------------------------------------------------------ */
  /* Main menu actions                                                   */
  /* ------------------------------------------------------------------ */

  const openPanel = useCallback((kind: PanelKind = "root") => {
    mutate((prev) => ({ ...prev, panel: { kind, cursor: 0 } }));
  }, [mutate]);

  const closePanel = useCallback(() => mutate((prev) => ({ ...prev, panel: null })), [mutate]);

  const saveGame = useCallback((slot: number) => {
    const s = snapRef.current;
    if (!s.scene) return;
    const payload: SavePayload = {
      version: 1,
      savedAt: Date.now(),
      sceneLevel: s.scene.level,
      sceneName: s.scene.name,
      previousLevel: s.previousLevel,
      x: s.x,
      y: s.y,
      dir: s.dir,
      party: s.party,
      money: s.money,
      activityRechargeGold: s.activityRechargeGold ?? 0,
      activityConsumeGold: s.activityConsumeGold ?? 0,
      mp: s.mp,
      maxMp: s.maxMp,
      level: s.level,
      exp: s.exp,
      inventory: s.inventory,
      flags: s.flags,
      openedChests: s.openedChests,
      formation: s.formation,
      chapter: s.chapter,
    };
    localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify(payload));
    savesRef.current = { ...savesRef.current, [slot]: payload };
    toast(`已保存到存档 ${slot + 1}`);
  }, [mutate, toast]);

  const loadSave = useCallback((save: SavePayload, slot?: number) => {
    const d = currentData();
    const scene = d.scenes.find((x) => x.level === save.sceneLevel) ?? d.scenes[0];
    if (!scene) return;
    const repaired = { ...save, flags: pruneInvalidEventFlags(save.flags, d.scenes) };
    if (slot !== undefined && Object.keys(repaired.flags).length !== Object.keys(save.flags).length) {
      localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify(repaired));
      savesRef.current = { ...savesRef.current, [slot]: repaired };
    }
    save = repaired;
    trailRef.current = seedTeamTrail(save.x, save.y, save.dir, Math.max(0, save.party.length - 1));
    followPosRef.current = trailRef.current.map((p) => ({ ...p }));
    mutate((prev) => ({
      ...prev,
      screen: "field",
      scene,
      previousLevel: save.previousLevel,
      x: save.x,
      y: save.y,
      dir: save.dir,
      party: save.party,
      money: save.money,
      activityRechargeGold: save.activityRechargeGold ?? 0,
      activityConsumeGold: save.activityConsumeGold ?? 0,
      mp: save.mp,
      maxMp: save.maxMp,
      level: save.level,
      exp: save.exp,
      inventory: save.inventory,
      flags: pruneInvalidEventFlags(save.flags, d.scenes),
      openedChests: save.openedChests,
      formation: save.formation,
      chapter: save.chapter,
      meetStep: 0,
      eventPos: {},
      panel: null,
      dialogue: null,
      battle: null,
      shop: null,
      coupon: null,
      toast: "读档完成",
    }));
    toast("读档完成");
    const spawn = { x: save.x, y: save.y };
    currentSceneToken.current++;
    setTimeout(() => runAutoEvents(scene, spawn, currentSceneToken.current), 520);
  }, [currentData, mutate, runAutoEvents, toast]);

  const useInventoryItem = useCallback((name: string) => {
    const d = currentData();
    const item = d.items.get(name);
    if (!item || !item.heal) {
      toast("该物品不能在这里使用");
      return;
    }
    mutate((prev) => {
      const target = prev.party.find((m) => m.dead) ?? prev.party[0];
      if (!target) return prev;
      const inv = prev.inventory.map((i) => ({ ...i }));
      const hit = inv.find((i) => i.name === name);
      if (!hit || hit.count <= 0) return prev;
      hit.count--;
      const heal = name.includes("招魂") ? target.maxHp : 120 + prev.level * 10;
      const party = prev.party.map((m) => m.key === target.key ? { ...m, hp: name.includes("招魂") ? m.maxHp : clamp(m.hp + heal, 0, m.maxHp), dead: false } : m);
      toast(`${name} 对 ${target.name} 生效`);
      return { ...prev, party, inventory: inv.filter((i) => i.count > 0) };
    });
  }, [currentData, mutate, toast]);

  const equipItem = useCallback((name: string) => {
    const d = currentData();
    const equip = d.equipment.get(name);
    if (!equip) { toast("这不是装备"); return; }
    const s = snapRef.current;
    const memberIndex = s.panel?.member ?? 0;
    const member = s.party[memberIndex];
    if (!member) return;
    mutate((prev) => {
      const inv = prev.inventory.map((i) => ({ ...i }));
      const hit = inv.find((i) => i.name === name);
      if (!hit || hit.count <= 0) return prev;
      hit.count--;
      if (hit.count <= 0) inv.splice(inv.indexOf(hit), 1);
      const slot = equip.equipType;
      const old = member.equipment[slot];
      if (old) {
        const oldSlot = inv.find((i) => i.name === old);
        if (oldSlot) oldSlot.count++; else inv.push({ name: old, count: 1 });
      }
      const party = prev.party.map((m, idx) => idx === memberIndex ? { ...m, equipment: { ...m.equipment, [slot]: name } } : m);
      toast(`${member.name} 装备了 ${name}`);
      return { ...prev, party, inventory: inv.filter((i) => i.count > 0) };
    });
  }, [currentData, mutate, toast]);

  const useSkillInfo = useCallback((name: string) => {
    const d = currentData();
    const sk = d.skills.get(name);
    if (!sk) { toast("尚未习得该计策"); return; }
    toast(`${sk.name}　消耗 ${sk.cost} 谋略点　${sk.text || ""}`);
  }, [currentData, toast]);

  const changeFormation = useCallback((name: string) => {
    const d = currentData();
    const f = d.formations.get(name);
    if (!f) return;
    mutate((prev) => ({ ...prev, formation: name }));
    toast(`阵形变更为 ${name}`);
  }, [mutate, toast]);

  /* ------------------------------------------------------------------ */
  /* New game / prologue                                                 */
  /* ------------------------------------------------------------------ */

  const startNewGame = useCallback(() => {
    const d = currentData();
    const start = d.content.start;
    const party: Member[] = [];
    for (const name of start.characters) {
      const m = makeMember(name, start.lv, d);
      if (m) party.push(m);
    }
    let inventory: InventorySlot[] = start.inventory.slots.map((slot) => ({ name: slot.item, count: slot.count }));
    const equipped = autoEquip(party, inventory, true);
    mutate((prev) => ({
      ...prev,
      screen: "prologue",
      prologuePage: 0,
      scene: null,
      party: equipped.party,
      inventory: equipped.inventory,
      money: start.money,
      activityRechargeGold: 0,
      activityConsumeGold: 0,
      mp: start.maxMp,
      maxMp: start.maxMp,
      level: start.lv,
      exp: start.exp,
      flags: {},
      openedChests: {},
      formation: start.defaultFormation,
      chapter: 1,
      meetStep: 0,
      eventPos: {},
      dialogue: null,
      panel: null,
      shop: null,
      coupon: null,
      battle: null,
      log: ["新游戏 · 序"],
    }));
    const startScene = d.scenes.find((s) => s.level === 12);
    if (startScene) {
      // The prologue is rendered first; the first playable scene is 徐州宫殿.
    }
  }, [autoEquip, currentData, makeMember, mutate]);

  const proceedPrologue = useCallback(() => {
    const d = currentData();
    const start = d.scenes.find((x) => x.level === 12) ?? d.scenes[0];
    if (!start) return;
    loadScene(start.level, "开场", false);
  }, [currentData, loadScene]);

  // 原版序章是按键翻页，不再自动滚动；J 下一页，K 直接跳过。

  /* ------------------------------------------------------------------ */
  /* Terminal / input                                                    */
  /* ------------------------------------------------------------------ */

  const boxed = useCallback(() => {
    const s = snapRef.current;
    return s.screen === "field" && !s.panel && !s.shop && !s.coupon && !s.battle;
  }, []);

  const move = useCallback(async (dx: number, dy: number) => {
    const s = snapRef.current;
    if (!boxed() || !s.scene || locked.current || moving.current) return;
    const fromX = s.x;
    const fromY = s.y;
    const nx = fromX + dx;
    const ny = fromY + dy;
    mutate((prev) => ({ ...prev, dir: [dx, dy] }));
    // 原版 TeamMove 在移动前先用 TriggerQuestEvent(vector, ...) 判定目标格：
    // 踩到 Trigger 事件格时脚本先执行，不会因为格上站着 NPC 而被阻挡。
    const triggerEvent = s.scene.events
      .filter((e) => {
        if (!e.id || e.when !== 1) return false;
        if (!eventVisible(e, s.flags, chapterName(s.chapter))) return false;
        if (e.hideAfter && e.names.some((n) => n.name && s.party.some((m) => m.name === n.name))) return false;
        const walk = npcWalkRef.current[e.id];
        const p = walk ? [walk.x, walk.y] as [number, number] : s.eventPos[e.id] ?? e.pos;
        return dist(p[0], p[1], nx, ny) < 0.8;
      })
      .sort((a, b) => dist(a.pos[0], a.pos[1], nx, ny) - dist(b.pos[0], b.pos[1], nx, ny))[0];
    if (triggerEvent) {
      void runEvent(triggerEvent);
      return;
    }
    if (blockedAt(s.scene, nx, ny)) {
      return;
    }
    const blockingNpc = s.scene.events.find((e) => {
      if (!e.id || e.when !== 2) return false;
      // startHide 的 NPC 还没出现在脚本里，不能占住格子；徐州南门的陈登
      // 在第一章尚未登场，却会挡住唯一的出城通道。
      if (!eventVisible(e, s.flags, chapterName(s.chapter))) return false;
      if (e.hideAfter && e.names.some((n) => n.name && s.party.some((m) => m.name === n.name))) return false;
      // 店铺店主是独立 GameObject，身体和阴影在 shop.pos（柜台后），事件格则
      // 落在柜台前沿。阻挡用柜台后实体位置，对话锚点用事件格，两者分开。
      const shop = shopNpcFor(s.scene?.level);
      const walk = npcWalkRef.current[e.id];
      const p = shop?.event === String(e.id)
        ? shop.pos
        : walk ? [walk.x, walk.y] as [number, number] : s.eventPos[e.id] ?? e.pos;
      return dist(p[0], p[1], nx, ny) < 0.72;
    });
    if (blockingNpc) {
      return;
    }
    trailRef.current = [
      { x: fromX, y: fromY, dir: [dx, dy] as [number, number] },
      ...trailRef.current,
    ].slice(0, Math.max(0, s.party.length - 1));
    const followCount = trailRef.current.length;
    const followFallback = seedTeamTrail(fromX, fromY, [dx, dy], followCount);
    followPosRef.current = Array.from({ length: followCount }, (_, i) => {
      const cur = followPosRef.current[i] ?? followFallback[i] ?? { x: fromX, y: fromY, dir: [dx, dy] as [number, number] };
      return { ...cur };
    });
    const followStart = followPosRef.current.map((p) => ({ ...p }));
    const followTargets = trailRef.current.slice(0, followCount);
    moving.current = true;
    const duration = 180;
    const started = performance.now();
    await new Promise<void>((resolve) => {
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / duration);
        followPosRef.current = followTargets.map((target, i) => {
          const start = followStart[i] ?? target;
          return {
            x: start.x + (target.x - start.x) * t,
            y: start.y + (target.y - start.y) * t,
            dir: target.dir,
          };
        });
        mutate((prev) => ({
          ...prev,
          x: fromX + (nx - fromX) * t,
          y: fromY + (ny - fromY) * t,
        }));
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    followPosRef.current = followTargets.map((p) => ({ ...p }));
    mutate((prev) => ({ ...prev, x: nx, y: ny }));
    moving.current = false;
    if (tryEncounter(s.scene, nx, ny)) return;
    void triggerOnEnter(s.scene, nx, ny);
    const held = [...heldKeys.current].reverse().find((k) => DIR_KEYS[k]);
    if (held) {
      const [ndx, ndy] = DIR_KEYS[held];
      if (!locked.current) void moveRef.current?.(ndx, ndy);
    }
  }, [blockedAt, boxed, mutate, runEvent, toast, triggerOnEnter, tryEncounter]);
  moveRef.current = move;

  const interact = useCallback(async () => {
    const s = snapRef.current;
    if (!s.scene || locked.current) return;
    if (performance.now() < suppressInteractUntil.current) return;
    const scene = s.scene;
    const shop = shopNpcFor(scene.level);
    const at = (e: SceneEvent) => {
      const walk = npcWalkRef.current[e.id];
      return walk ? [walk.x, walk.y] as [number, number] : s.eventPos[e.id] ?? e.pos;
    };

    // 室内外人物都按原版格子站位：正交四格与斜角四格都算贴身，不能因为
    // 欧氏距离 1.414 把斜着站在 NPC 影子旁的情况判成“没碰到”。
    const canTalk = (e: SceneEvent) => {
      const [ax, ay] = at(e);
      const dx = Math.abs(ax - s.x);
      const dy = Math.abs(ay - s.y);
      if (shop?.event === String(e.id)) return dx <= 1.05 && dist(ax, ay, s.x, s.y) < 2.0;
      return (dx <= 1.05 && dy <= 1.05) || dist(ax, ay, s.x, s.y) < 1.1;
    };
    const ev = scene.events
      .filter((e) => e.when === 2 && e.id && eventVisible(e, s.flags, chapterName(s.chapter)) && !(e.hideAfter && e.names.some((n) => n.name && s.party.some((m) => m.name === n.name))) && canTalk(e))
      .sort((a, b) => dist(at(a)[0], at(a)[1], s.x, s.y) - dist(at(b)[0], at(b)[1], s.x, s.y))[0];
    if (ev) { await runEvent(ev); return; }

    const chest = scene.chests.find((c) => !s.openedChests[c.id] && dist(c.pos[0], c.pos[1], s.x, s.y) < 0.8);
    if (chest) {
      mutate((prev) => {
        const inv = prev.inventory.map((i) => ({ ...i }));
        for (const item of chest.items) {
          const hit = inv.find((i) => i.name === item.name);
          if (hit) hit.count += item.count; else inv.push({ name: item.name, count: item.count });
        }
        return {
          ...prev,
          money: prev.money + chest.money,
          inventory: inv,
          openedChests: { ...prev.openedChests, [chest.id]: true },
        };
      });
      const pieces = [];
      if (chest.money) pieces.push(`${chest.money} 金`);
      if (chest.items.length) pieces.push(chest.items.map((i) => `${i.name}×${i.count}`).join("、"));
      await talk(s.party[0]?.name ?? "刘备", s.party[0]?.profile ?? "刘备", `获得 ${pieces.join("，") || "些许物品"}`);
      return;
    }

    const trans = scene.transitions.find((t) => t.when === 2 && dist(t.pos[0], t.pos[1], s.x, s.y) < 1.2);
    if (trans) {
      loadSceneByName(trans.scene, trans.tag || undefined, trans.type);
      return;
    }
  }, [loadSceneByName, mutate, runEvent]);

  const activateTitle = useCallback((index: number) => {
    mutate((prev) => ({ ...prev, titleCursor: index }));
    if (index === 0) {
      toast("解甲归田");
      window.setTimeout(() => window.close(), 180);
    }
    else if (index === 1) openPanel("settings");
    else if (index === 2) openPanel("load");
    else if (index === 3) startNewGame();
  }, [mutate, openPanel, startNewGame, toast]);

  const handleKey = useCallback(async (e: KeyboardEvent) => {
    const key = ARROW_TO_KEY[e.code] ?? e.code;
    const isDir = ["KeyW", "KeyA", "KeyS", "KeyD"].includes(key);
    if (e.repeat) {
      if (isDir) e.preventDefault();
      return;
    }
    if (isDir || ["KeyJ", "KeyK"].includes(key)) e.preventDefault();
    if (key === "KeyJ" || key === "KeyK") gameAudio.play("click");
    const s = snapRef.current;

    if (s.dialogue) {
      if (key === "KeyW" || key === "KeyS") {
        if (s.dialogue.ask) mutate((prev) => prev.dialogue ? { ...prev, dialogue: { ...prev.dialogue, choice: prev.dialogue.choice === 0 ? 1 : 0 } } : prev);
        return;
      }
      if (key === "KeyJ") { finishDialogue(s.dialogue.ask ? s.dialogue.choice === 0 : true); return; }
      if (key === "KeyK" && s.dialogue.ask) { finishDialogue(false); return; }
      if (key === "KeyK" && !s.dialogue.ask) { finishDialogue(true); return; }
      return;
    }

    if (s.shop) {
      if (key === "KeyW") mutate((prev) => prev.shop ? { ...prev, shop: { ...prev.shop, cursor: (prev.shop.cursor + prev.shop.items.length - 1) % Math.max(1, prev.shop.items.length) } } : prev);
      if (key === "KeyS") mutate((prev) => prev.shop ? { ...prev, shop: { ...prev.shop, cursor: (prev.shop.cursor + 1) % Math.max(1, prev.shop.items.length) } } : prev);
      if (key === "KeyJ") buyShopItem(s.shop.cursor);
      if (key === "KeyK") closeShop();
      return;
    }

    if (s.coupon) {
      if (key === "KeyK") closeCouponVendor();
      if (key === "KeyA" || key === "KeyD") {
        mutate((prev) => prev.coupon ? {
          ...prev,
          coupon: { ...prev.coupon, tab: prev.coupon.tab === "coupon" ? "tcr" : "coupon", note: null },
        } : prev);
      }
      if (key === "KeyW" || key === "KeyS") {
        const delta = key === "KeyW" ? 1 : -1;
        mutate((prev) => {
          if (!prev.coupon) return prev;
          if (prev.coupon.tab === "coupon") {
            const count = Math.max(1, couponGoldOffers.length);
            return {
              ...prev,
              coupon: {
                ...prev.coupon,
                tickets: (prev.coupon.tickets + delta + count) % count,
                note: null,
              },
            };
          }
          const count = Math.max(1, goldTcrOffers.length);
          return {
            ...prev,
            coupon: {
              ...prev.coupon,
              gold: (prev.coupon.gold + delta + count) % count,
              note: null,
            },
          };
        });
      }
      if (key === "KeyJ" && activity?.status === "active" && !s.coupon.busy) {
        if (s.coupon.tab === "coupon") void redeemCouponsAtVendor(s.coupon.tickets);
        else void exchangeTcrAtVendor(s.coupon.gold);
      }
      return;
    }

    if (s.battle) {
      const b = s.battle;
      if (b.outcome) {
        if (key === "KeyJ" || key === "KeyK" || key === "Enter" || key === "Space") {
          continueBattleOutcome();
        }
        return;
      }
      if (!b.pending) return;
      const enemies = b.units.filter((u) => u.side === "enemy" && u.hp > 0);
      const skills = b.units.find((u) => u.key === b.pending)?.skills ?? [];
      const items = s.inventory.filter((i) => {
        const it = dataRef.current?.items.get(i.name);
        return it?.heal;
      });
      const cursorMax = () => {
        if (b.menu === "attack" || b.menu === "target") return Math.max(1, enemies.length);
        if (b.menu === "skill") return Math.max(1, skills.length);
        if (b.menu === "item") return Math.max(1, items.length);
        if (b.menu === "enemy") return Math.max(1, enemies.length);
        if (b.menu === "general") return Math.max(1, s.party.length);
        return 6;
      };
      const moveCommandCursor = (delta: number) => {
        mutate((prev) => {
          if (!prev.battle) return prev;
          const next = clamp(prev.battle.cursor + delta, 0, 5);
          return { ...prev, battle: { ...prev.battle, cursor: next } };
        });
      };
      if (b.menu === "enemy" && (key === "KeyA" || key === "KeyD")) {
        mutate((prev) => {
          if (!prev.battle) return prev;
          const next = (prev.battle.cursor + (key === "KeyA" ? -1 : 1) + enemies.length) % Math.max(1, enemies.length);
          return { ...prev, battle: { ...prev.battle, cursor: next } };
        });
      } else if (b.menu === "command" && (key === "KeyW" || key === "KeyS")) {
        moveCommandCursor(key === "KeyW" ? -2 : 2);
      } else if (b.menu === "command" && (key === "KeyA" || key === "KeyD")) {
        const row = Math.floor(b.cursor / 2);
        const col = b.cursor % 2;
        const nextCol = clamp(col + (key === "KeyA" ? -1 : 1), 0, 1);
        mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, cursor: row * 2 + nextCol } } : prev);
      } else if (key === "KeyW") mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, cursor: (prev.battle.cursor + cursorMax() - 1) % cursorMax() } } : prev);
      else if (key === "KeyS") mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, cursor: (prev.battle.cursor + 1) % cursorMax() } } : prev);
      else if (key === "KeyK") {
        if (b.menu !== "command") mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, menu: "command", cursor: 0, skill: null } } : prev);
      } else if (key === "KeyJ") {
        const resolve = battleResolve.current;
        if (b.menu === "command") {
          if (b.cursor === 0) mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, menu: "attack", cursor: 0 } } : prev);
          else if (b.cursor === 1) {
            if (b.pending === b.units.find((u) => u.side === "player")?.key) {
              battleResolve.current = null; mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, pending: null, menu: "command" } } : prev);
              resolve?.({ type: "offensive" });
            } else {
              battleResolve.current = null; mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, pending: null, menu: "command" } } : prev);
              resolve?.({ type: "defend" });
            }
          } else if (b.cursor === 2) {
            if (skills.length === 0) toast("尚未习得计策");
            else mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, menu: "skill", cursor: 0 } } : prev);
          } else if (b.cursor === 3) mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, menu: "enemy", cursor: 0 } } : prev);
          else if (b.cursor === 4) {
            if (items.length === 0) toast("没有可用物品");
            else mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, menu: "item", cursor: 0 } } : prev);
          } else if (b.cursor === 5 && b.pending === b.units.find((u) => u.side === "player")?.key) { battleResolve.current = null; mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, pending: null, menu: "command" } } : prev); resolve?.({ type: "flee" }); }
        } else if (b.menu === "general") {
          const m = s.party[b.cursor];
          const mu = b.units.find((u) => u.side === "player" && u.name === m?.name);
          if (m) toast(`${m.name}　武力 ${mu?.str ?? "?"}　智力 ${mu?.ler ?? "?"}　兵力 ${mu?.hp ?? m.hp}`);
        } else if (b.menu === "attack") {
          const target = enemies[b.cursor];
          if (target) { battleResolve.current = null; mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, pending: null, menu: "command" } } : prev); resolve?.({ type: "attack", target: target.key }); }
        } else if (b.menu === "skill") {
          const skillName = skills[b.cursor];
          if (skillName) {
            const sk = dataRef.current?.skills.get(skillName);
            if (sk && sk.targetScope > 1) {
              battleResolve.current = null;
              mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, pending: null, menu: "command" } } : prev);
              resolve?.({ type: "skill", skill: skillName });
            } else {
              mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, menu: "target", cursor: 0, skill: skillName } } : prev);
            }
          }
        } else if (b.menu === "target") {
          const target = enemies[b.cursor];
          if (target && b.skill) {
            battleResolve.current = null;
            mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, pending: null, menu: "command", skill: null } } : prev);
            resolve?.({ type: "skill", skill: b.skill, target: target.key });
          }
        } else if (b.menu === "item") {
          const item = items[b.cursor];
          if (item) {
            battleResolve.current = null;
            mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, pending: null, menu: "command" } } : prev);
            resolve?.({ type: "item", item: item.name, target: "p0" });
          }
        }
      }
      return;
    }

    if (s.panel) {
      const p = s.panel;
      const rootCount = ROOT_ITEMS.length + 1;
      if (p.kind === "root") {
        if (key === "KeyK") { closePanel(); return; }
        if (key === "KeyW" || key === "KeyS") {
          mutate((prev) => prev.panel ? { ...prev, panel: { ...prev.panel, cursor: (prev.panel.cursor + (key === "KeyW" ? rootCount - 1 : 1)) % rootCount } } : prev);
          return;
        }
        if (key === "KeyJ") {
          if (p.cursor >= ROOT_ITEMS.length) { closePanel(); return; }
          openPanel(ROOT_ITEMS[p.cursor]);
          return;
        }
      }

      if (p.kind === "generals") {
        if (key === "KeyK") { openPanel("root"); return; }
        if (key === "KeyA" || key === "KeyD") {
          mutate((prev) => prev.panel ? {
            ...prev,
            panel: {
              ...prev.panel,
              member: ((prev.panel.member ?? 0) + (key === "KeyA" ? prev.party.length - 1 : 1)) % Math.max(1, prev.party.length),
              cursor: 0,
            },
          } : prev);
        }
        return;
      }

      if (p.kind === "settings") {
        if (key === "KeyK") { if (s.screen === "title") closePanel(); else openPanel("root"); return; }
        if (key === "KeyJ" || key === "KeyW" || key === "KeyS") mutate((prev) => ({ ...prev, speed: prev.speed >= 2 ? 0.75 : prev.speed + 0.25 }));
        return;
      }
      if (key === "KeyK") { if (p.kind === "load" || p.kind === "save") closePanel(); else openPanel("root"); return; }
      if (p.kind === "party") {
        if (key === "KeyW" || key === "KeyS") mutate((prev) => prev.panel ? { ...prev, panel: { ...prev.panel, cursor: (prev.panel.cursor + (key === "KeyW" ? Math.max(1, prev.party.length) - 1 : 1)) % Math.max(1, prev.party.length) } } : prev);
        return;
      }
      if (p.kind === "inventory") {
        if (key === "KeyW" || key === "KeyS") mutate((prev) => prev.panel ? { ...prev, panel: { ...prev.panel, cursor: (prev.panel.cursor + (key === "KeyW" ? Math.max(1, prev.inventory.length) - 1 : 1)) % Math.max(1, prev.inventory.length) } } : prev);
        if (key === "KeyJ") { const it = s.inventory[p.cursor]; if (it) useInventoryItem(it.name); }
        return;
      }
      if (p.kind === "equipment") {
        const equipmentInv = s.inventory.filter((i) => dataRef.current?.equipment.has(i.name));
        if (key === "KeyA" || key === "KeyD") {
          mutate((prev) => prev.panel ? {
            ...prev,
            panel: {
              ...prev.panel,
              member: ((prev.panel.member ?? 0) + (key === "KeyA" ? prev.party.length - 1 : 1)) % Math.max(1, prev.party.length),
              cursor: 0,
            },
          } : prev);
          return;
        }
        if (key === "KeyW" || key === "KeyS") {
          mutate((prev) => prev.panel ? { ...prev, panel: { ...prev.panel, cursor: (prev.panel.cursor + (key === "KeyW" ? Math.max(1, equipmentInv.length) - 1 : 1)) % Math.max(1, equipmentInv.length) } } : prev);
        }
        if (key === "KeyJ") { const it = equipmentInv[p.cursor]; if (it) equipItem(it.name); }
        return;
      }
      if (p.kind === "skills") {
        const member = s.party[p.member ?? 0];
        const skills = member ? memberSkillsAtLevel(member, s.level) : [];
        if (key === "KeyA" || key === "KeyD") {
          mutate((prev) => prev.panel ? {
            ...prev,
            panel: {
              ...prev.panel,
              member: ((prev.panel.member ?? 0) + (key === "KeyA" ? prev.party.length - 1 : 1)) % Math.max(1, prev.party.length),
              cursor: 0,
            },
          } : prev);
          return;
        }
        if (key === "KeyW" || key === "KeyS") mutate((prev) => prev.panel ? { ...prev, panel: { ...prev.panel, cursor: (prev.panel.cursor + (key === "KeyW" ? Math.max(1, skills.length) - 1 : 1)) % Math.max(1, skills.length) } } : prev);
        if (key === "KeyJ") { const sk = skills[p.cursor]; if (sk) useSkillInfo(sk); }
        return;
      }
      if (p.kind === "formations") {
        const d = dataRef.current;
        const owned = d ? learnedFormationsAtLevel(d.content, s.level, s.formation) : [];
        if (key === "KeyW" || key === "KeyS") mutate((prev) => prev.panel ? { ...prev, panel: { ...prev.panel, cursor: (prev.panel.cursor + (key === "KeyW" ? Math.max(1, owned.length) - 1 : 1)) % Math.max(1, owned.length) } } : prev);
        if (key === "KeyJ") { const f = owned[p.cursor]; if (f) changeFormation(f); }
        return;
      }
      if (p.kind === "save" || p.kind === "load") {
        if (key === "KeyW" || key === "KeyS") mutate((prev) => prev.panel ? { ...prev, panel: { ...prev.panel, cursor: (prev.panel.cursor + (key === "KeyW" ? 2 : 1)) % 3 } } : prev);
        if (key === "KeyJ") {
          const slot = p.cursor;
          if (p.kind === "save") saveGame(slot);
          else {
            const save = savesRef.current[slot];
            if (save) loadSave(save, slot);
            else toast("该存档为空");
          }
        }
        return;
      }
      if (p.kind === "story") {
        if (key === "KeyK") openPanel("root");
        return;
      }
      return;
    }

    if (s.screen === "title") {
      // 原版标题是四列横排：A/D 左右选择，W/S 也保留为等价操作。
      if (key === "KeyD" || key === "KeyS") mutate((prev) => ({ ...prev, titleCursor: (prev.titleCursor + 1) % 4 }));
      if (key === "KeyA" || key === "KeyW") mutate((prev) => ({ ...prev, titleCursor: (prev.titleCursor + 3) % 4 }));
      if (key === "KeyJ") activateTitle(s.titleCursor);
      if (key === "KeyK") return;
      return;
    }

    if (s.screen === "prologue") {
      if (key === "KeyJ") {
        if (s.prologuePage < PROLOGUE_PAGES.length - 1) mutate((prev) => ({ ...prev, prologuePage: prev.prologuePage + 1 }));
        else proceedPrologue();
      }
      if (key === "KeyK") proceedPrologue();
      return;
    }

    if (s.screen === "gameover") {
      if (key === "KeyJ" || key === "KeyK" || key === "Enter" || key === "Space") leaveGameOver();
      return;
    }

    if (s.screen === "field" && !s.panel && !s.shop && !s.coupon && !s.battle) {
      const dir = DIR_KEYS[key];
      if (dir) move(dir[0], dir[1]);
      else if (key === "KeyJ") void interact();
      else if (key === "KeyK") openPanel("root");
    }
  }, [activateTitle, activity, banner, buyShopItem, changeFormation, closeCouponVendor, closePanel, closeShop, continueBattleOutcome, currentData, equipItem, exchangeTcrAtVendor, finishDialogue, goldPerTcr, leaveGameOver, loadSave, loadScene, memberSkillsAtLevel, move, mutate, openPanel, proceedPrologue, saveGame, startNewGame, toast, useInventoryItem, useSkillInfo, interact]);

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (DIR_KEYS[e.code]) {
        heldKeys.current.delete(e.code);
        heldKeys.current.add(e.code);
        e.preventDefault();
      }
      void handleKey(e);
    };
    const release = (e: KeyboardEvent) => {
      heldKeys.current.delete(e.code);
    };
    const clear = () => heldKeys.current.clear();
    window.addEventListener("keydown", listener);
    window.addEventListener("keyup", release);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", listener);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", clear);
    };
  }, [handleKey]);

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  }, []);

  // 原版 BattleTeamMono.UpdateAnim：战斗进行时每 0.5s 在朝右前进帧 0/1 间切换；
  // 胜利结算才切到朝下的正面帧。网页端敌方由 CSS 水平镜像，同样面向敌人。
  useEffect(() => {
    setBattleAnimFrame(0);
    if (snap.screen !== "battle" || snap.battle?.outcome) return;
    const timer = window.setInterval(() => setBattleAnimFrame((f) => (f + 1) % 2), 500);
    return () => window.clearInterval(timer);
  }, [snap.screen, snap.battle?.outcome]);

  // 弹窗 / 商店 / 战斗列表的光标移动后，把当前项滚进最近的可滚动容器。
  const cursorSignature = [
    snap.panel?.kind,
    snap.panel?.member,
    snap.panel?.cursor,
    snap.shop?.title,
    snap.shop?.cursor,
    snap.battle?.menu,
    snap.battle?.cursor,
    snap.coupon?.tab,
  ].join("|");
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const active = document.querySelector<HTMLElement>('[data-km-cursor="1"]');
      const box = active?.closest<HTMLElement>("[data-km-scroll]");
      if (!active || !box) return;
      const a = active.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      if (a.top < b.top) box.scrollTop -= b.top - a.top - 4;
      else if (a.bottom > b.bottom) box.scrollTop += a.bottom - b.bottom + 4;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [cursorSignature]);

  const virtualHeld = useRef<string | null>(null);
  const dispatchKey = useCallback((type: "keydown" | "keyup", code: string) => {
    const key = code.startsWith("Key") ? code.slice(3).toLowerCase() : code;
    window.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true }));
  }, []);
  const fireKey = useCallback((code: string) => dispatchKey("keydown", code), [dispatchKey]);
  const stopVirtual = useCallback(() => {
    if (virtualHeld.current) {
      dispatchKey("keyup", virtualHeld.current);
      virtualHeld.current = null;
    }
  }, [dispatchKey]);
  const virtualPress = useCallback((e: ReactPointerEvent<HTMLButtonElement>, code: string, hold = false) => {
    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 触屏浏览器可能不支持指针捕获 */ }
    stopVirtual();
    fireKey(code);
    if (hold) virtualHeld.current = code;
    else dispatchKey("keyup", code);
  }, [dispatchKey, fireKey, stopVirtual]);
  useEffect(() => {
    const release = () => stopVirtual();
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
      stopVirtual();
    };
  }, [stopVirtual]);

  const s = snap;
  if (!s.ready || !data) {
    return (
      <div className={styles.root}>
        <div className={styles.loading}>
          <div className={styles.loadingMark}>孔</div>
          <p>正在展开舆图……</p>
        </div>
      </div>
    );
  }

  const scene = s.scene;
  const map = scene?.map ?? null;
  // 桌面版 Camera.orthographicSize=7：固定 14 个地块高，16:9 即 25×14 格。
  // 之前按 1366×768 直接当逻辑分辨率，实际看到 42×24 格，整体缩得过小。
  const viewW = 800;
  const viewH = 450;
  const baseCell = map?.scale ?? 32;
  const zoom = map ? Math.max(1, 32 / Math.max(1, baseCell)) : 1;
  const cell = baseCell * zoom;
  const mapW = map ? map.w * cell : 0;
  const mapH = map ? map.h * cell : 0;
  let camX = 0;
  let camY = 0;
  let playerSX = 0;
  let playerSY = 0;
  if (scene && map) {
    const rawX = (s.x - map.x + 0.5) * cell;
    const rawY = (map.y + map.h - s.y - 0.5) * cell;
    camX = mapW <= viewW ? (mapW - viewW) / 2 : clamp(rawX - viewW / 2, 0, mapW - viewW);
    camY = mapH <= viewH ? (mapH - viewH) / 2 : clamp(rawY - viewH / 2, 0, mapH - viewH);
    // 摄像机只能落在整像素上，地图/瓦片/烘焙阴影才不会被重采样切出半像素断层。
    camX = Math.round(camX);
    camY = Math.round(camY);
    playerSX = rawX - camX;
    playerSY = rawY - camY;
  }
  const sx = (gx: number) => (map ? (gx - map.x + 0.5) * cell - camX : 0);
  const sy = (gy: number) => (map ? (map.y + map.h - gy - 0.5) * cell - camY : 0);

  const seenEvents = new Set<string>();
  const currentChapter = chapterName(s.chapter);
  // 主城（徐州、冀州这类「城 / 州」场景）只留有名有姓的剧情 NPC；
  // 大爷 / 中年人 / 书生这类无名路人原本只是站着不动的 npc-* 单帧贴图，按用户要求不再绘制。
  const isCityScene = !scene?.isWorld && !scene?.isCave && /(城|州)$/.test(scene?.name ?? "");
  const fieldEvents = (scene?.events ?? []).filter((e) => {
    if (!e.id || !eventVisible(e, s.flags, currentChapter)) return false;
    if (isCityScene && e.names.every((n) => !n.name) && (e.model ?? "").startsWith("npc-")) return false;
    if (e.hideAfter && e.names.some((n) => n.name && s.party.some((m) => m.name === n.name))) return false;
    const k = `${e.id}:${e.pos[0]}:${e.pos[1]}`;
    if (seenEvents.has(k)) return false;
    seenEvents.add(k);
    return true;
  });
  const fieldChests = (scene?.chests ?? []).filter((c) => c.show && !s.openedChests[c.id]);
  const leader = s.party[0];
  const playerSprite = walkStripForModel(leader?.model);
  const playerPalette: ModelPalette | null =
    data.palettes.get(leader?.name ?? "") ?? data.palettes.get(leader?.profile ?? "") ?? null;
  const playerFrame = frameForDir(
    s.dir,
    moving.current && typeof performance !== "undefined" ? Math.floor(performance.now() / 120) : 0,
  );
  const fieldPhase = moving.current && typeof performance !== "undefined" ? Math.floor(performance.now() / 120) : 0;
  const fallbackTrail = seedTeamTrail(s.x, s.y, s.dir, Math.max(0, s.party.length - 1));
  const followerEntries = s.party.slice(1).map((m, i) => {
    const pos = followPosRef.current[i] ?? trailRef.current[i] ?? fallbackTrail[i] ?? { x: s.x, y: s.y, dir: s.dir };
    return { member: m, pos, frame: frameForDir(pos.dir, fieldPhase) };
  });
  const shopNpc = scene ? shopNpcFor(scene.level) : null;
  const activeShopFace =
    s.dialogue && shopNpc?.event === activeEvent.current?.id
      ? shopFaceForProfile(s.dialogue.profile)
      : null;
  const shopDialogueFace =
    s.dialogue && shopNpc && activeEvent.current?.id === shopNpc.event
      ? shopNpc.image
      : null;
  const dialogueFace = s.dialogue
    ? activeShopFace ?? shopDialogueFace ?? faceForProfile(s.dialogue.profile) ?? faceForProfile(s.dialogue.name)
    : null;
  const showDialoguePortrait = Boolean(s.dialogue && (s.dialogue.name || dialogueFace));
  const titleLabels = ["解甲归田", "厉兵秣马", "匡扶汉室", "初出茅庐"];
  const titleHints = ["退出游戏", "设置", "读取存档", "开始新游戏"];
  const rootLabels = ["部将", "队列", "装备", "物品", "谋略", "阵形", "剧情", "保存", "设置", "返回"];
  const panelTitle: Record<string, string> = {
    root: "军帐",
    generals: "部将",
    party: "队列",
    inventory: "物品",
    equipment: "装备",
    skills: "谋略",
    formations: "阵形",
    story: "剧情",
    save: "保存进度",
    load: "读取进度",
    settings: "设置",
  };
  const panel = s.panel;
  const battle = s.battle;
  const pendingUnit = battle ? battle.units.find((u) => u.key === battle.pending) : null;
  const enemies = battle ? battle.units.filter((u) => u.side === "enemy" && u.hp > 0) : [];
  const battleSkills = pendingUnit?.skills ?? [];
  const battleItems = s.inventory.filter((i) => data.items.get(i.name)?.heal);
  const battleLeaderKey = battle?.units.find((u) => u.side === "player")?.key;
  const battleCommands = pendingUnit?.key === battleLeaderKey
    ? ["攻击", "总攻", "谋略", "部将", "宝物", "撤退"]
    : ["攻击", "防御", "谋略", "部将", "宝物", ""];
  const equipmentInv = s.inventory.filter((i) => data.equipment.has(i.name));

  return (
    <div className={styles.root} data-scene={s.scene?.level ?? ""} data-pos={`${s.x},${s.y}`}>
      <div className={styles.activityHead}>
        <div className={styles.activityTitleRow}>
          <span className={styles.activityBadge}>限时活动</span>
          <h1 className={styles.activityTitle}>诸葛孔明传 · 吞食天地２怀旧版</h1>
          <SoundToggle game="kongming" battle={s.screen === "battle"} className="ml-auto" />
          <button type="button" className={styles.fullscreenButton} onClick={() => void toggleFullscreen()}>
            {fullscreenView ? "退出全屏" : "全屏游玩"}
          </button>
        </div>
        <p className={styles.activityDesc}>
          按 Windows 桌面版逐场景复刻。方向键 / WASD 移动，J 确认、K 取消，触屏可直接使用画面内虚拟按键。
        </p>
        <p className={styles.activityNote}>
          封面四项：解甲归田 退出 · 厉兵秣马 设置 · 匡扶汉室 读取存档 · 初出茅庐 开始新游戏
        </p>
      </div>
      <div ref={frameWrapRef} className={`${styles.frameWrap} ${fullscreenView ? styles.frameWrapFull : ""}`}>
      <div className={`${styles.frame} ${s.shake ? styles.shake : ""}`}>
        {s.screen === "loading" && (
          <div className={styles.loading}>
            <div className={styles.loadingMark}>孔</div>
            <p>正在展开舆图……</p>
          </div>
        )}

        {s.screen === "title" && (
          <div className={styles.titleScreen}>
            <div className={styles.titleStars} />
            <img className={styles.titleLogo} src="/game-assets/kongming/ui/TitleLogo.png" alt="三国演义" />
            <div className={styles.titleSwordWrap}>
              <img className={styles.titleSword} src="/game-assets/kongming/ui/TitleSword.png" alt="" aria-hidden />
              <h1 className={styles.titleName}>諸葛孔明伝</h1>
              <span className={styles.titleVersion}>怀旧版 v1.0.5</span>
            </div>
            <ul className={styles.titleMenu}>
              {titleLabels.map((label, i) => (
                <li
                  key={label}
                  className={s.titleCursor === i ? styles.menuOn : undefined}
                  onMouseEnter={() => mutate((prev) => ({ ...prev, titleCursor: i }))}
                  onClick={() => activateTitle(i)}
                  role="button"
                  tabIndex={0}
                  title={titleHints[i]}
                  aria-label={`${label}（${titleHints[i]}）`}
                >
                  <span className={styles.menuArrow}>{s.titleCursor === i ? "▼" : ""}</span>
                  <span className={styles.menuLabel}>{label}</span>
                </li>
              ))}
            </ul>
            <div className={styles.titleFoot}>© 本宮ひろ志 / M&amp;M / 集英社 / CAPCOM 1991</div>
          </div>
        )}

        {s.screen === "prologue" && (
          <div className={styles.storyScreen}>
            <div className={styles.storyViewport} ref={storyViewRef}>
              {(() => {
                const page = PROLOGUE_PAGES[clamp(s.prologuePage, 0, PROLOGUE_PAGES.length - 1)];
                return (
                  <div className={styles.storyPage}>
                    {page.text && <p className={styles.storyText}>{page.text}</p>}
                    {page.top && <p className={styles.storyText}>{page.top}</p>}
                    {page.image && <img className={styles.storyImage} src={page.image} alt="" draggable={false} />}
                    {page.bottom && <p className={styles.storyText}>{page.bottom}</p>}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {(s.screen === "field" || s.screen === "battle" || s.screen === "gameover") && scene && map && (
          <div className={styles.field} ref={fieldViewRef} data-scale={viewScale}>
            <svg
              className={styles.world}
              viewBox={`0 0 ${viewW} ${viewH}`}
              preserveAspectRatio="xMidYMid meet"
              style={{
                width: `${viewW * viewScale}px`,
                height: `${viewH * viewScale}px`,
                left: `${viewOffset.x}px`,
                top: `${viewOffset.y}px`,
              }}
              shapeRendering="crispEdges"
            >
              <rect width={viewW} height={viewH} fill={scene.isWorld || scene.isCave || isIndoorScene(scene.name) ? "#10130f" : "url(#town-grass)"} />
              <defs>
                <pattern id="town-grass" width={32} height={32} patternUnits="userSpaceOnUse">
                  <image href="/game-assets/kongming/ui/town-grass.png" width={32} height={32} className={styles.pixel} preserveAspectRatio="none" />
                </pattern>
                <clipPath id="clip-player">
                  <rect x={playerSX - WALK_CELL / 2} y={playerSY - WALK_FOOT} width={WALK_CELL} height={WALK_CELL} />
                </clipPath>
                {followerEntries.map(({ pos }, i) => (
                  <clipPath id={`clip-follower-${i}`} key={`clip-${i}`}>
                    <rect x={sx(pos.x) - WALK_CELL / 2} y={sy(pos.y) - WALK_FOOT} width={WALK_CELL} height={WALK_CELL} />
                  </clipPath>
                ))}
              </defs>
              <image
                href={map.src}
                x={-camX}
                y={-camY}
                width={mapW}
                height={mapH}
                className={styles.pixel}
                preserveAspectRatio="none"
              />
              <WaterOverlay src={map.src} x={-camX} y={-camY} width={mapW} height={mapH} />
              {fieldEvents.map((e, i) => {
                const walk = npcWalk[e.id];
                const shop = shopNpcFor(scene?.level);
                const isShopNpc = Boolean(shop && String(e.id) === shop.event);
                const p = isShopNpc && shop ? shop.pos : walk ? [walk.x, walk.y] as [number, number] : s.eventPos[e.id] ?? e.pos;
                const ex = sx(p[0]);
                const ey = sy(p[1]);
                if (ex < -80 || ex > viewW + 80 || ey < -100 || ey > viewH + 80) return null;
                if (isShopNpc && shop) {
                  return (
                    <g key={`${e.id}-${i}`}>
                      <image
                        href={shop.image}
                        x={ex - 16}
                        y={ey - 32}
                        width={32}
                        height={32}
                        preserveAspectRatio="xMidYMid meet"
                        className={styles.pixel}
                      />
                    </g>
                  );
                }
                const profile = e.names[0]?.profile ?? null;
                const name = e.names[0]?.name?.trim() ?? "";
                const ch = data.characters.get(name) ?? data.characters.get(profile ?? "");
                const motion = npcMotionFor(scene?.level, e.id);
                const sprite = spriteForModel(e.model ?? ch?.modelTexture);
                const strip = npcWalkStripFor(motion) ?? walkStripForModel(ch?.modelTexture ?? e.model);
                const palette: ModelPalette | null =
                  data.palettes.get(name) ?? data.palettes.get(profile ?? "") ?? data.palettes.get(ch?.name ?? "") ?? null;
                if (!strip && !sprite) return null;
                const dir = walk?.dir ?? (motion ? DIR_VECTORS[motion.dirs[0]] ?? [0, -1] : [0, -1] as [number, number]);
                const moving = Boolean(walk?.move);
                const animFrame = frameForDir(dir, moving ? npcClock % 2 : Math.floor(npcClock / 4) % 2);
                return (
                  <g key={`${e.id}-${i}`}>
                    <svg x={ex - WALK_CELL / 2} y={ey - WALK_FOOT} width={WALK_CELL} height={WALK_CELL} viewBox={`0 0 ${WALK_CELL} ${WALK_CELL}`} preserveAspectRatio="xMidYMid meet" overflow="hidden">
                      {strip ? (
                        <TintedSvgSprite src={strip} palette={palette} x={-animFrame * WALK_CELL} y={0} width={WALK_CELL * 8} height={WALK_CELL} className={styles.pixel} />
                      ) : (
                        <TintedSvgSprite src={sprite!} palette={palette} x={0} y={0} width={WALK_CELL} height={WALK_CELL} className={styles.pixel} />
                      )}
                    </svg>
                    {name && null}
                  </g>
                );
              })}
              {fieldChests.map((c) => {
                const cx = sx(c.pos[0]);
                const cy = sy(c.pos[1]);
                return (
                  <g key={c.id}>
                    <rect x={cx - 11} y={cy - 18} width={22} height={18} rx={2} fill="#8a5b26" stroke="#e2b865" strokeWidth={1.5} />
                    <rect x={cx - 2} y={cy - 18} width={4} height={18} fill="#e2b865" />
                  </g>
                );
              })}
              {followerEntries.map(({ member: m, pos, frame }, i) => {
                if (m.dead) return null;
                // 换场景时队伍尾段还在门后或墙体里，不把精灵画到建筑上。
                if (!scene || blockedAt(scene, pos.x, pos.y)) return null;
                const strip = walkStripForModel(m.model);
                const palette: ModelPalette | null =
                  data.palettes.get(m.name) ?? data.palettes.get(m.profile) ?? null;
                const fx = sx(pos.x);
                const fy = sy(pos.y);
                return (
                  <g key={m.key}>
                    {strip ? (
                      <TintedSvgSprite
                        src={strip}
                        palette={palette}
                        x={fx - WALK_CELL / 2 - frame * WALK_CELL}
                        y={fy - WALK_FOOT}
                        width={WALK_CELL * 8}
                        height={WALK_CELL}
                        clipPath={`url(#clip-follower-${i})`}
                        className={styles.pixel}
                      />
                    ) : (
                      <circle cx={fx} cy={fy - 12} r={11} fill="#3b4c45" stroke="#d8c38f" strokeWidth={2} />
                    )}
                  </g>
                );
              })}
              {playerSprite ? (
                <TintedSvgSprite
                  src={playerSprite}
                  palette={playerPalette}
                  x={playerSX - WALK_CELL / 2 - playerFrame * WALK_CELL}
                  y={playerSY - WALK_FOOT}
                  width={WALK_CELL * 8}
                  height={WALK_CELL}
                  clipPath="url(#clip-player)"
                  className={styles.pixel}
                />
              ) : (
                <circle cx={playerSX} cy={playerSY - 12} r={11} fill="#294b63" stroke="#d8c38f" strokeWidth={2} />
              )}
              {!playerSprite && (
                <text x={playerSX} y={playerSY - 8} textAnchor="middle" fill="#fff" fontSize={10}>{leader?.name?.[0] ?? "刘"}</text>
              )}
              {map.fg && (
                <image
                  href={map.fg}
                  x={-camX}
                  y={-camY}
                  width={mapW}
                  height={mapH}
                  className={styles.pixel}
                  preserveAspectRatio="none"
                />
              )}
            </svg>

          </div>
        )}

        {s.screen === "battle" && battle && (
          <div className={styles.battleScreen}>
            <div className={styles.battleTerrain} />

            {battle.units.filter((u) => u.side === "player").slice(0, 5).map((u, i) => {
              const sprite = spriteForModel(u.model);
              const deadSprite = u.hp <= 0 ? deathSpriteForModel(u.model) : null;
              const readyFrame =
                !battle.outcome && u.hp > 0
                  ? battleReadyFrameForModel(u.model, battleAnimFrame)
                  : null;
              const attackFrame =
                battle.fx?.actor === u.key && battle.fx.frame !== null
                  ? attackFrameForModel(u.model, battle.fx.frame)
                  : null;
              const hurt = battle.fx?.target === u.key && battle.fx?.hurt;
              const palette: ModelPalette | null =
                data.palettes.get(u.name) ?? data.palettes.get(u.profile ?? "") ?? null;
              return (
              <div
                key={u.key}
                className={`${styles.battleRow} ${styles.battleRowPlayer} ${u.hp <= 0 && !deadSprite ? styles.unitDown : ""} ${battle.pending === u.key ? styles.battleRowActive : ""} ${hurt ? styles.battleRowHurt : ""}`}
                style={{ top: `${BATTLE_ROW_TOP[i]}%` }}
              >
                <div className={styles.battleStats}>
                  <strong>{u.name}</strong>
                  <span>{u.hp}</span>
                </div>
                <div className={styles.battleHpBar}>
                  <i style={{ clipPath: `inset(0 ${100 - (u.maxHp ? (u.hp / u.maxHp) * 100 : 0)}% 0 0)` }} />
                </div>
                <div className={styles.battleSprite}>
                  {deadSprite ? (
                    <TintedSprite className={styles.battleFrameTall} src={deadSprite} palette={palette} alt="" />
                  ) : attackFrame ? (
                    <TintedSprite className={styles.battleFrameTall} src={attackFrame} palette={palette} alt="" />
                  ) : readyFrame ? (
                    <TintedSprite className={styles.battleReadySprite} src={readyFrame} palette={palette} alt="" />
                  ) : sprite ? (
                    <TintedSprite src={sprite} palette={palette} />
                  ) : faceForProfile(u.profile) ? (
                    <img src={faceForProfile(u.profile)!} alt="" />
                  ) : (
                    <span>{u.name[0]}</span>
                  )}
                </div>
              </div>
              );
            })}

            {battle.units.filter((u) => u.side === "enemy").slice(0, 5).map((u, i) => {
              const idx = enemies.findIndex((e) => e.key === u.key);
              const lit = (battle.menu === "attack" || battle.menu === "target") && idx === battle.cursor;
              const sprite = spriteForModel(u.model);
              const deadSprite = u.hp <= 0 ? deathSpriteForModel(u.model) : null;
              const readyFrame =
                !battle.outcome && u.hp > 0
                  ? battleReadyFrameForModel(u.model, battleAnimFrame)
                  : null;
              const attackFrame =
                battle.fx?.actor === u.key && battle.fx.frame !== null
                  ? attackFrameForModel(u.model, battle.fx.frame)
                  : null;
              const hurt = battle.fx?.target === u.key && battle.fx?.hurt;
              const palette: ModelPalette | null =
                data.palettes.get(u.name) ?? data.palettes.get(u.profile ?? "") ?? null;
              return (
                <div
                  key={u.key}
                  className={`${styles.battleRow} ${styles.battleRowEnemy} ${u.hp <= 0 && !deadSprite ? styles.unitDown : ""} ${lit ? styles.battleRowActive : ""} ${hurt ? styles.battleRowHurt : ""}`}
                  style={{ top: `${BATTLE_ROW_TOP[i]}%` }}
                >
                  {lit && <span className={styles.battleTargetMark} aria-hidden />}
                  <div className={`${styles.battleSprite} ${!battle.outcome ? styles.battleFlip : ""}`}>
                    {deadSprite ? (
                      <TintedSprite className={styles.battleFrameTall} src={deadSprite} palette={palette} alt="" />
                    ) : attackFrame ? (
                      <TintedSprite className={styles.battleFrameTall} src={attackFrame} palette={palette} alt="" />
                    ) : readyFrame ? (
                      <TintedSprite className={styles.battleReadySprite} src={readyFrame} palette={palette} alt="" />
                    ) : sprite ? (
                      <TintedSprite src={sprite} palette={palette} />
                    ) : faceForProfile(u.profile) ? (
                      <img src={faceForProfile(u.profile)!} alt="" />
                    ) : (
                      <span>{u.name[0]}</span>
                    )}
                  </div>
                  <div className={`${styles.battleHpBar} ${styles.battleHpBarEnemy}`}>
                    <i style={{ clipPath: `inset(0 0 0 ${100 - (u.maxHp ? (u.hp / u.maxHp) * 100 : 0)}%)` }} />
                  </div>
                  <div className={`${styles.battleStats} ${styles.battleStatsEnemy}`}>
                    <strong>{u.name}</strong>
                    <span>{u.hp}</span>
                  </div>
                </div>
              );
            })}

            {battle.menu === "enemy" && enemies[battle.cursor] && (() => {
              const e = enemies[battle.cursor];
              const rows: [string, number][] = [
                ["武", e.str], ["智", e.ler], ["速", e.spd], ["攻", e.atk], ["防", e.def], ["谋", e.mp],
              ];
              return (
                <div className={styles.battleEnemyPage}>
                  <div className={styles.enemyPortrait}>
                    {faceForProfile(e.profile) ? <img src={faceForProfile(e.profile)!} alt="" /> : <span>{e.name[0]}</span>}
                    <strong>{e.name}</strong>
                  </div>
                  <div className={styles.enemyStats}>
                    {rows.map(([label, value]) => (
                      <div key={label}>
                        <b>{label}</b>
                        <span>{value}</span>
                        <i><em style={{ width: `${clamp(value / 255, 0, 1) * 100}%` }} /></i>
                      </div>
                    ))}
                  </div>
                  <div className={styles.enemyMeta}>
                    <span>兵 <b>{e.hp}</b></span>
                    <span>武器 <b>{weaponTypeNames(e.weaponBits)}</b></span>
                    <span>地形 <b>{terrainTypeNames(e.terrainBits)}</b></span>
                  </div>
                  <section className={styles.enemySkillPanel}>
                    <h3>谋略</h3>
                    <div className={styles.enemyMemo} data-km-scroll="1">
                      {e.skills.length > 0
                        ? e.skills.map((sk) => <span key={sk}>{sk}</span>)
                        : <span>尚未习得计策</span>}
                    </div>
                  </section>
                  <div className={styles.enemyPageHint}>W/S 查看敌将　K 返回</div>
                  <div className={styles.enemyPager}><span>◀</span><span>▶</span></div>
                </div>
              );
            })()}

            {!battle.outcome && (() => {
              const faceUnit = pendingUnit ?? battle.units.find((u) => u.side === "player" && u.hp > 0);
              const face = faceUnit ? faceForProfile(faceUnit.profile) : null;
              return face ? (
                <div className={styles.battlePortrait}>
                  <img src={face} alt="" />
                </div>
              ) : null;
            })()}

            {battle.outcome && (
              <div className={styles.battleResult} onPointerDown={continueBattleOutcome}>
                <div className={styles.battleOutcomePanel}>
                  <h2 className={
                    battle.outcome.kind === "win" ? styles.resultWin
                      : battle.outcome.kind === "flee" ? styles.resultFlee
                        : styles.resultLose
                  }>
                    {battle.outcome.kind === "win" ? "战斗胜利" : battle.outcome.kind === "flee" ? "撤退成功" : "全军覆没"}
                  </h2>
                  {battle.outcome.kind === "win" && (
                    <p className={styles.battleOutcomeText}>
                      获金 <b>{battle.outcome.money}</b>　经验 <b>{battle.outcome.exp}</b>　等级 <b>Lv {battle.outcome.level}</b>
                      {battle.outcome.learned.length > 0 ? `　习得 ${battle.outcome.learned.join("、")}` : ""}
                    </p>
                  )}
                  {battle.outcome.kind === "flee" && <p className={styles.battleOutcomeText}>暂且避其锋芒，来日再战。</p>}
                  {battle.outcome.kind === "lose" && <p className={styles.battleOutcomeText}>刘玄德兵败，只得暂避锋芒。</p>}
                  <span className={styles.battleResultNext}>{battle.outcome.kind === "lose" ? "J / 点击 返回标题" : "J / 点击 继续行军"}</span>
                </div>
              </div>
            )}

            {!battle.outcome && (
              <div className={`${styles.battleDialogBox} ${battle.menu === "skill" ? styles.battleDialogTall : ""}`}>
                {battle.intro ? (
                  <p className={styles.battleIntroText}>{battle.log[0]}</p>
                ) : battle.menu === "command" ? (
                  <div className={styles.battleCommandGrid}>
                    {battleCommands.map((label, i) => (
                      <div
                        key={label}
                        className={battle.cursor === i ? styles.commandOn : undefined}
                        onClick={() => {
                          mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, cursor: i } } : prev);
                          fireKey("KeyJ");
                        }}
                      >
                        <span className={battle.cursor === i ? styles.commandCursor : undefined} />{label}
                      </div>
                    ))}
                  </div>
                ) : battle.menu === "general" ? (
                  <div className={styles.battleGeneralList} data-km-scroll="1">
                    <p className={styles.battlePanelTitle}>武将</p>
                    {s.party.map((m, i) => {
                      const mu = battle.units.find((u) => u.side === "player" && u.name === m.name);
                      return (
                        <div key={m.key} data-km-cursor={battle.cursor === i ? "1" : undefined} className={battle.cursor === i ? styles.commandOn : undefined}>
                          <span className={battle.cursor === i ? styles.commandCursor : undefined} />{m.name}
                          <em>武 {mu?.str ?? "-"}　智 {mu?.ler ?? "-"}　兵 {mu?.hp ?? m.hp}</em>
                        </div>
                      );
                    })}
                    <small>W/S 选择　K 返回</small>
                  </div>
                ) : battle.menu === "attack" || battle.menu === "target" ? (
                  <div className={styles.battleTargetPrompt}>
                    <p className={styles.battlePanelTitle}>{battle.menu === "target" ? `${battle.skill} · 选择目标` : "攻击 · 选择目标"}</p>
                    <div className={styles.battleTargetNow}>
                      <span className={styles.commandCursor} />
                      <b>{enemies[battle.cursor]?.name ?? "无目标"}</b>
                      <em>兵 {enemies[battle.cursor]?.hp ?? 0}</em>
                    </div>
                    <small>W/S 选敌　J 确认　K 返回</small>
                  </div>
                ) : battle.menu === "skill" ? (
                  <div className={styles.battleSkillMenu}>
                    <div className={styles.battleSkillHead}><span>谋略</span><b>剩余 SP {s.mp}</b></div>
                    <div className={styles.battleSkillGrid} data-km-scroll="1">
                      {battleSkills.map((name, i) => {
                        const sk = data.skills.get(name);
                        return (
                          <div key={name} data-km-cursor={battle.cursor === i ? "1" : undefined} className={`${styles.battleSkillCell} ${battle.cursor === i ? styles.rowOn : ""}`}>
                            <span>{battle.cursor === i ? "◆ " : ""}{name}</span>
                            <em>{sk?.cost ?? 0}</em>
                          </div>
                        );
                      })}
                    </div>
                    <div className={styles.battleSkillFoot}>
                      <span>消耗 {data.skills.get(battleSkills[battle.cursor])?.cost ?? 0}</span>
                      <small>W/S 选择　J 使用　K 返回</small>
                    </div>
                  </div>
                ) : battle.menu === "item" ? (
                  <div className={styles.battleTargetList} data-km-scroll="1">
                    <p className={styles.battlePanelTitle}>宝物</p>
                    {battleItems.map((it, i) => (
                      <div key={it.name} data-km-cursor={battle.cursor === i ? "1" : undefined} className={battle.cursor === i ? styles.commandOn : undefined}>
                        <span className={battle.cursor === i ? styles.commandCursor : undefined} />{it.name}<em>× {it.count}</em>
                      </div>
                    ))}
                    <small>J 使用于 {leader?.name}　K 返回</small>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}

        {s.screen === "gameover" && (
          <div className={styles.gameover} onPointerDown={leaveGameOver}>
            <div className={styles.gameoverCard} role="button" tabIndex={0} onClick={leaveGameOver}>
              <h2>全军覆没</h2>
              <p>{s.gameoverReason || "刘玄德兵败，只得暂避锋芒。"}</p>
              <span>J / 点击 返回标题</span>
            </div>
          </div>
        )}

        {panel && (
          <div className={styles.panelLayer}>
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                <h2>{panelTitle[panel.kind] ?? "军帐"}</h2>
                <span>K 返回</span>
              </div>

              {panel.kind === "root" && (
                <ul className={styles.rootMenu}>
                  {rootLabels.map((label, i) => (
                    <li
                      key={label}
                      className={panel.cursor === i ? styles.menuOn : undefined}
                      onClick={() => {
                        mutate((prev) => prev.panel ? { ...prev, panel: { ...prev.panel, cursor: i } } : prev);
                        fireKey("KeyJ");
                      }}
                    >
                      <span>{panel.cursor === i ? "◆" : ""}</span>{label}
                    </li>
                  ))}
                </ul>
              )}

              {panel.kind === "generals" && (() => {
                const m = s.party[panel.member ?? 0];
                if (!m) {
                  return <div className={styles.panelBody}><p className={styles.emptyText}>尚无武将</p></div>;
                }
                const combat = memberCombatStats(m, s.level);
                const skills = memberSkillsAtLevel(m, s.level);
                const face = faceForProfile(m.profile);
                const rows: [string, number][] = [
                  ["武力", combat.str], ["智力", combat.ler], ["速度", combat.spd],
                  ["攻击", combat.atk], ["防御", combat.def], ["兵力", combat.maxHp],
                ];
                return (
                  <div className={`${styles.panelBody} ${styles.generalBody}`} data-km-scroll="1">
                    <div className={styles.memberTabs}>
                      {s.party.map((member, i) => (
                        <span key={member.key} className={(panel.member ?? 0) === i ? styles.tabOn : undefined}>{member.name}</span>
                      ))}
                      <small>A/D 切换</small>
                    </div>
                    <div className={styles.generalCard}>
                      <div className={styles.generalPortrait}>
                        {face ? <img src={face} alt="" /> : <span>{m.name[0]}</span>}
                        <strong>{m.name}</strong>
                        <em>Lv {m.level} · 兵 {m.hp}/{combat.maxHp}</em>
                      </div>
                      <div className={styles.generalStats}>
                        {rows.map(([label, value]) => (
                          <div key={label}>
                            <b>{label}</b>
                            <span>{value}</span>
                            <i><em style={{ width: `${clamp(value / 255, 0, 1) * 100}%` }} /></i>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className={styles.generalColumns}>
                      <section>
                        <h3>装备</h3>
                        <div className={styles.generalEquip}>
                          {[0, 1, 2, 3].map((slot) => (
                            <div key={slot}>
                              <span>{["武器", "防具", "护具", "盾牌"][slot]}</span>
                              <b>{m.equipment[slot] ?? "—"}</b>
                            </div>
                          ))}
                        </div>
                      </section>
                      <section>
                        <h3>谋略</h3>
                        <div className={styles.generalSkills}>
                          {skills.length > 0
                            ? skills.map((name) => (
                                <span key={name}>
                                  {name}<em>{data.skills.get(name)?.cost ?? 0} 计力</em>
                                </span>
                              ))
                            : <p className={styles.emptyText}>尚未习得计策</p>}
                        </div>
                      </section>
                    </div>
                  </div>
                );
              })()}

              {panel.kind === "party" && (
                <div className={styles.panelBody} data-km-scroll="1">
                  {s.party.map((m, i) => (
                    <div key={m.key} data-km-cursor={panel.cursor === i ? "1" : undefined} className={`${styles.partyRow} ${panel.cursor === i ? styles.rowOn : ""}`}>
                      <span>{i + 1}</span>
                      <b>{m.name}{i === 0 ? "（队长）" : ""}</b>
                      <span>Lv {m.level}</span>
                      <span>{m.hp} / {m.maxHp}</span>
                      <span>{m.dead ? "重伤" : "可战"}</span>
                    </div>
                  ))}
                  {s.party.length === 0 && <p className={styles.emptyText}>尚无武将</p>}
                </div>
              )}

              {panel.kind === "inventory" && (
                <div className={styles.panelBody} data-km-scroll="1">
                  <div className={styles.moneyLine}>所持金 <b>{s.money}</b></div>
                  {s.inventory.map((it, i) => (
                    <div key={it.name} data-km-cursor={panel.cursor === i ? "1" : undefined} className={`${styles.listRow} ${panel.cursor === i ? styles.rowOn : ""}`}>
                      <span>{it.name}</span><span>× {it.count}</span>
                    </div>
                  ))}
                  {s.inventory.length === 0 && <p className={styles.emptyText}>囊中空空</p>}
                </div>
              )}

              {panel.kind === "equipment" && (
                <div className={styles.panelBody} data-km-scroll="1">
                  <div className={styles.memberTabs}>
                    {s.party.map((m, i) => (
                      <span key={m.key} className={(panel.member ?? 0) === i ? styles.tabOn : undefined}>{m.name}</span>
                    ))}
                    <small>A/D 切换</small>
                  </div>
                  {(() => {
                    const m = s.party[panel.member ?? 0];
                    if (!m) return <p className={styles.emptyText}>尚无武将</p>;
                    return (
                      <>
                        <div className={styles.equipSlots}>
                          {[0, 1, 2, 3].map((slot) => {
                            const name = m.equipment[slot];
                            return (
                              <div key={slot}>
                                <span>{["武器", "防具", "护具", "盾牌"][slot]}</span>
                                <b>{name ?? "—"}</b>
                              </div>
                            );
                          })}
                        </div>
                        <div className={styles.invTitle}>可装备</div>
                        {equipmentInv.map((it, i) => (
                          <div key={it.name} data-km-cursor={panel.cursor === i ? "1" : undefined} className={`${styles.listRow} ${panel.cursor === i ? styles.rowOn : ""}`}>
                            <span>{it.name}</span><span>× {it.count}</span>
                          </div>
                        ))}
                        {equipmentInv.length === 0 && <p className={styles.emptyText}>没有可换装备</p>}
                      </>
                    );
                  })()}
                </div>
              )}

              {panel.kind === "skills" && (() => {
                const m = s.party[panel.member ?? 0];
                const skills = m ? memberSkillsAtLevel(m, s.level) : [];
                return (
                  <div className={styles.panelBody} data-km-scroll="1">
                    <div className={styles.memberTabs}>
                      {s.party.map((member, i) => (
                        <span key={member.key} className={(panel.member ?? 0) === i ? styles.tabOn : undefined}>{member.name}</span>
                      ))}
                      <small>A/D 切换</small>
                    </div>
                    <div className={styles.menuSkillHead}>
                      <span>剩余计力</span><b>{s.mp} / {s.maxMp}</b>
                    </div>
                    {skills.length > 0 ? (
                      <div className={styles.menuSkillGrid}>
                        {skills.map((name, i) => (
                          <div key={name} data-km-cursor={panel.cursor === i ? "1" : undefined} className={`${styles.menuSkillCell} ${panel.cursor === i ? styles.rowOn : ""}`}>
                            <span>{panel.cursor === i ? "◆ " : ""}{name}</span>
                            <em>{data.skills.get(name)?.cost ?? 0} 计力</em>
                          </div>
                        ))}
                      </div>
                    ) : <p className={styles.emptyText}>尚未习得计策</p>}
                  </div>
                );
              })()}

              {panel.kind === "formations" && (() => {
                const owned = learnedFormationsAtLevel(data.content, s.level, s.formation);
                return (
                  <div className={styles.panelBody} data-km-scroll="1">
                    <div className={styles.moneyLine}>当前阵形 <b>{s.formation}</b><span className={styles.formationHint}>J 变阵</span></div>
                    <div className={styles.formationGrid}>
                      {owned.map((name, i) => {
                        const f = data.formations.get(name);
                        return (
                          <div key={name} data-km-cursor={panel.cursor === i ? "1" : undefined} className={`${styles.formationCard} ${panel.cursor === i ? styles.rowOn : ""}`}>
                            <div>
                              <strong>{name}</strong>
                              <span>{name === s.formation ? "使用中" : `计力 ${f?.cost ?? 0}`}</span>
                            </div>
                            <small>{formationEffectText(f)}</small>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {panel.kind === "story" && (
                <div className={styles.panelBody}>
                  {s.log.slice(-30).map((line, i) => <p key={i} className={styles.storyLine}>{line}</p>)}
                  <p className={styles.storyLine}>旗号：{chapterName(s.chapter)} · {sceneLabel(scene)}</p>
                </div>
              )}

              {(panel.kind === "save" || panel.kind === "load") && (
                <div className={styles.panelBody}>
                  {[0, 1, 2].map((slot) => (
                    <div key={slot} className={`${styles.saveRow} ${panel.cursor === slot ? styles.rowOn : ""}`}>
                      <span>存档 {slot + 1}</span>
                      <b>{saveLabel(savesRef.current[slot])}</b>
                    </div>
                  ))}
                </div>
              )}

              {panel.kind === "settings" && (
                <div className={styles.panelBody}>
                  <div className={styles.settingRow}><span>文字速度</span><b>{s.speed.toFixed(2)}×</b></div>
                  <p className={styles.emptyText}>J / W / S 调整</p>
                  <div className={styles.settingRow}><span>操作</span><b>WASD · J · K</b></div>
                </div>
              )}
            </div>
          </div>
        )}

        {s.shop && (
          <div className={styles.panelLayer}>
            <div className={styles.shopBox}>
              <div className={styles.panelHead}><h2>{s.shop.title}</h2><span>所持 {s.money} 金{activity ? ` · ${activity.couponName} ${couponTickets} 张` : ""}</span></div>
              <div className={styles.panelBody} data-km-scroll="1">
                {s.shop.items.map((it, i) => (
                  <div key={it.name} data-km-cursor={s.shop?.cursor === i ? "1" : undefined} className={`${styles.listRow} ${s.shop?.cursor === i ? styles.rowOn : ""}`}>
                    <span>{it.name}</span><span>{it.price} 金</span>
                  </div>
                ))}
              </div>
              <div className={styles.panelFoot}>J 购买　K 离开</div>
            </div>
          </div>
        )}

        {s.coupon && (
          <div className={styles.panelLayer}>
            <div className={`${styles.shopBox} ${styles.couponBox}`}>
              <div className={styles.panelHead}>
                <h2>徐州券房</h2>
                <span>所持 {s.money} 金{activity ? ` · ${activity.couponName} ${couponTickets} 张` : ""}</span>
              </div>
              <div className={`${styles.panelBody} ${styles.couponColumns}`}>
                {!activity ? (
                  <p className={styles.emptyText}>
                    券房只接待登录将军。请先<a className={styles.vendorLogin} href="/login">登录</a>后再来交易。
                  </p>
                ) : activity.status !== "active" ? (
                  <p className={styles.emptyText}>
                    当前不在孔明传活动期（{activity.status === "pending" ? "尚未开始" : activity.status === "ended" ? "已结束" : "未开启"}）。
                  </p>
                ) : (
                  <>
                    <section className={`${styles.couponColumn} ${s.coupon!.tab === "coupon" ? styles.couponColumnOn : ""}`}>
                      <header>
                        <h3>活动券换金</h3>
                        <p>本期 {activity.couponName} · 现有 {couponTickets} 张</p>
                      </header>
                      {couponGoldOffers.map((offer, index) => (
                        <button
                          key={`coupon-${index}`}
                          type="button"
                          className={`${styles.couponOffer} ${s.coupon!.tab === "coupon" && s.coupon!.tickets === index ? styles.couponOfferOn : ""}`}
                          disabled={s.coupon!.busy || couponTickets < offer.tickets}
                          onClick={() => {
                            mutate((prev) => prev.coupon ? {
                              ...prev,
                              coupon: { ...prev.coupon, tab: "coupon", tickets: index, note: null },
                            } : prev);
                            void redeemCouponsAtVendor(index);
                          }}
                        >
                          <span>{offer.tickets} 张 {activity.couponName}</span>
                          <b>{offer.gold} 金</b>
                          <small>{couponTickets < offer.tickets ? "券不足" : "点击兑换"}</small>
                        </button>
                      ))}
                    </section>

                    <section className={`${styles.couponColumn} ${s.coupon!.tab === "tcr" ? styles.couponColumnOn : ""}`}>
                      <header>
                        <h3>金换 tcr</h3>
                        <p>现有 {s.money} 金 · 今日可用 {s.coupon!.dailyGoldLeft} 金</p>
                      </header>
                      {goldTcrOffers.map((offer, index) => (
                        <button
                          key={`tcr-${index}`}
                          type="button"
                          className={`${styles.couponOffer} ${s.coupon!.tab === "tcr" && s.coupon!.gold === index ? styles.couponOfferOn : ""}`}
                          disabled={
                            s.coupon!.busy ||
                            s.money < offer.gold ||
                            s.coupon!.dailyGoldLeft < offer.gold
                          }
                          onClick={() => {
                            mutate((prev) => prev.coupon ? {
                              ...prev,
                              coupon: { ...prev.coupon, tab: "tcr", gold: index, note: null },
                            } : prev);
                            void exchangeTcrAtVendor(index);
                          }}
                        >
                          <span>{offer.gold} 金</span>
                          <b>{offer.tcr} tcr</b>
                          <small>{s.coupon!.dailyGoldLeft < offer.gold ? "超出今日上限" : "点击兑换"}</small>
                        </button>
                      ))}
                    </section>
                    <p className={styles.couponCurrencyNote}>
                      交易货币：活动券 ×{couponTickets} · 金 {s.money}；{goldPerTcr} 金 = 1 tcr，到账后 {tcrValidDays} 天有效。
                      <br />
                      本档活动累计：充值（券换金）{s.activityRechargeGold ?? 0} 金 · 消费（金币交易）{s.activityConsumeGold ?? 0} 金
                    </p>
                  </>
                )}
                {s.coupon.note && <p className={styles.vendorNote}>{s.coupon.note}</p>}
              </div>
              <div className={styles.panelFoot}>K 离开　点击商品成交</div>
            </div>
          </div>
        )}

        {s.dialogue && (
          <div
            className={styles.dialogueLayer}
            onPointerDown={() => { if (!s.dialogue?.ask) finishDialogue(true); }}
          >
            <div className={styles.dialogueBox} />
            {showDialoguePortrait && (
              <div className={styles.dialoguePortrait}>
                <img
                  className={styles.dialogueFace}
                  src={dialogueFace ?? "/game-assets/kongming/ui/DialogueDefault.png"}
                  alt=""
                />
                <img className={styles.dialogueFaceBoard} src="/game-assets/kongming/ui/DialogueBoard.png" alt="" />
              </div>
            )}
            {s.dialogue.name && <div className={styles.dialogueName}>{s.dialogue.name}</div>}
            <div className={`${styles.dialogueTextBox} ${showDialoguePortrait ? "" : styles.noPortrait}`}>
              <p className={styles.dialogueText}>{s.dialogue.text}</p>
              {s.dialogue.ask && (
                <div className={styles.choices}>
                  {["是", "否"].map((label, i) => (
                    <span
                      key={label}
                      role="button"
                      tabIndex={0}
                      className={s.dialogue?.choice === i ? styles.choiceOn : undefined}
                      onClick={(e) => { e.stopPropagation(); finishDialogue(i === 0); }}
                    >
                      {s.dialogue?.choice === i ? "◆ " : ""}{label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {!s.dialogue.ask && (
              <div className={styles.dialogueNext}>
                <img src="/game-assets/kongming/ui/DialogueNext.png" alt="" />
              </div>
            )}
          </div>
        )}

        {s.banner && <div className={styles.banner}>{s.banner}</div>}
        {s.toast && <div className={styles.toast}>{s.toast}</div>}
        {s.faded && <div className={styles.fade} />}
        {(s.screen === "field" || s.screen === "battle" || s.screen === "title" || s.screen === "prologue") && (
          <div className={styles.touchControls} data-touch={touchMode ? "1" : "0"}>
            {(s.screen === "field" || s.screen === "battle" || s.screen === "title") && (
              <div className={styles.touchDpad}>
                {(s.screen !== "title" || s.panel) && <button type="button" aria-label="向上" className={`${styles.touchKey} ${styles.touchUp}`} onPointerDown={(e) => virtualPress(e, "KeyW", true)} onPointerUp={stopVirtual} onPointerLeave={stopVirtual} onPointerCancel={stopVirtual}>W</button>}
                <button type="button" aria-label="向左" className={`${styles.touchKey} ${styles.touchLeft}`} onPointerDown={(e) => virtualPress(e, "KeyA", true)} onPointerUp={stopVirtual} onPointerLeave={stopVirtual} onPointerCancel={stopVirtual}>A</button>
                {(s.screen !== "title" || s.panel) && <button type="button" aria-label="向下" className={`${styles.touchKey} ${styles.touchDown}`} onPointerDown={(e) => virtualPress(e, "KeyS", true)} onPointerUp={stopVirtual} onPointerLeave={stopVirtual} onPointerCancel={stopVirtual}>S</button>}
                <button type="button" aria-label="向右" className={`${styles.touchKey} ${styles.touchRight}`} onPointerDown={(e) => virtualPress(e, "KeyD", true)} onPointerUp={stopVirtual} onPointerLeave={stopVirtual} onPointerCancel={stopVirtual}>D</button>
              </div>
            )}
            <div className={styles.touchActions}>
              <button type="button" aria-label="确认" className={`${styles.touchKey} ${styles.touchJ}`} onPointerDown={(e) => virtualPress(e, "KeyJ")}>J<small>{s.screen === "title" ? "确认" : s.screen === "prologue" ? "继续" : "确认"}</small></button>
              {(s.screen !== "title" || s.panel) && (
                <button type="button" aria-label="取消" className={`${styles.touchKey} ${styles.touchK}`} onPointerDown={(e) => virtualPress(e, "KeyK")}>K<small>{s.screen === "prologue" ? "跳过" : "取消"}</small></button>
              )}
            </div>
          </div>
        )}
      </div>
      <button type="button" className={styles.fullscreenToggle} onClick={() => void toggleFullscreen()}>
        {fullscreenView ? "退出全屏" : "全屏"}
      </button>
      </div>
      {activity ? (
        <div className={styles.couponWrap}>
          <KongmingCouponPanel
            activity={activity}
            couponGoldOffers={couponGoldOffers}
            onGold={receiveGold}
          />
        </div>
      ) : null}
    </div>
  );
}
