"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHAPTER_NAMES,
  chapterName,
  equipmentSlot,
  faceForProfile,
  hpFor,
  loadGameData,
  spriteForModel,
  type ChapterData,
  type CharacterData,
  type Content,
  type EquipmentData,
  type GameData,
  type ItemData,
  type Scene,
  type SceneEvent,
  type SkillData,
} from "@/lib/kongming/data";
import { LuaRuntime } from "@/lib/kongming/lua";
import styles from "./kongming-game.module.css";

type Screen = "loading" | "title" | "prologue" | "field" | "battle" | "gameover";

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
  | "party"
  | "inventory"
  | "equipment"
  | "skills"
  | "formations"
  | "save"
  | "load"
  | "settings"
  | "story";

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
  skills: string[];
  defending: boolean;
}

interface BattleState {
  units: BattleUnit[];
  round: number;
  log: string[];
  pending: string | null;
  menu: "command" | "attack" | "skill" | "item" | "formation" | "target";
  cursor: number;
  skill: string | null;
  menuTitle: string;
  result?: "win" | "lose";
}

interface BattleAction {
  type: "attack" | "skill" | "item" | "formation" | "defend" | "flee";
  target?: string;
  skill?: string;
  item?: string;
  formation?: string;
}

interface ShopState {
  title: string;
  items: { name: string; price: number; kind: "equipment" | "item" }[];
  cursor: number;
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
  mp: number;
  maxMp: number;
  level: number;
  exp: number;
  inventory: InventorySlot[];
  flags: Record<string, true>;
  openedChests: Record<string, true>;
  formation: string;
  chapter: number;
  dialogue: DialogueState | null;
  panel: PanelState | null;
  shop: ShopState | null;
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
const PROLOGUE = [
  "话说天下大势，分久必合，合久必分。\n东汉末年，持续了二百年之久的太平盛世终于纷乱了。\n大贤良师张角率领黄巾军在各地起事，一时间生灵涂炭、怨声载道，汉王朝已无力平乱。\n\n值此乱世，涌现出了三位英雄，立志兴复汉室。\n他们是：\n中山靖王刘胜的后裔——刘备，刘玄德；\n文武双全的美髯公——关羽，关云长；\n有万夫不当之勇的——张飞，张翼德。",
  "不求同年同月同日生，但求同年同月同日死。\n桃园结义的兄弟三人，招募义军，讨伐黄巾。\n曹操等人也加入了讨伐黄巾军的战斗，他们协力激战，终于战胜了张角，黄巾军被镇压了。\n但是，乱世并未结束。",
  "在平乱中按兵不动、保存实力的西凉太守董卓，借机进入都城洛阳，专政弄权，无恶不作。\n刘备等人又举兵声讨，终于消灭了董卓。\n天下似乎又太平了。\n\n然而……\n乱世还刚刚开始。\n奸雄曹操乘乱势逐步扩大力量，想一统天下；\n淮南袁术无视汉王朝，妄自称帝。\n\n还有……\n乱世还在继续……",
  "建安元年，曹操迎天子于许都，挟天子以令诸侯。\n徐州牧陶谦病故，刘备领徐州牧。\n淮南袁术僭号称帝，天下震动。\n\n汉室倾颓，群雄并起。\n诸葛孔明尚未出山，刘玄德仍在颠沛之中。\n\n一段属于刘备与诸葛亮的乱世传奇，就此拉开帷幕。",
];
const SCENE_ALIAS: Record<string, string> = {
  大地图: "世界地图",
  徐州城: "徐州",
  冀州城: "冀州",
  荆州城: "荆州",
  新野城: "新野",
  江夏城: "江夏",
  襄阳城: "襄阳",
  洛阳城: "洛阳宫殿",
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

/** 单位贴图是 8 帧横向条带：上、右、下、左各两帧。 */
function frameForDir(dir: [number, number]) {
  const [dx, dy] = dir;
  if (dy < 0) return 0;
  if (dx > 0) return 2;
  if (dy > 0) return 4;
  if (dx < 0) return 6;
  return 0;
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
  titleCursor: 0,
  prologuePage: 0,
  scene: null,
  previousLevel: 0,
  x: 0,
  y: 0,
  dir: [0, -1],
  party: [],
  money: 0,
  mp: 10,
  maxMp: 10,
  level: 1,
  exp: 0,
  inventory: [],
  flags: {},
  openedChests: {},
  formation: "散开阵",
  chapter: 1,
  dialogue: null,
  panel: null,
  shop: null,
  battle: null,
  banner: null,
  toast: null,
  faded: false,
  shake: false,
  speed: 1,
  log: [],
  gameoverReason: "",
};

export default function KongmingGame() {
  const [snap, setSnap] = useState<Snap>(EMPTY_SNAP);
  const snapRef = useRef<Snap>(EMPTY_SNAP);
  const [data, setData] = useState<GameData | null>(null);
  const dataRef = useRef<GameData | null>(null);
  const savesRef = useRef<Saves>({ 0: null, 1: null, 2: null });
  const dialogResolve = useRef<((value: boolean) => void) | null>(null);
  const battleResolve = useRef<((value: BattleAction) => void) | null>(null);
  const shopResolve = useRef<(() => void) | null>(null);
  const battleLoopResolve = useRef<((result: number) => void) | null>(null);
  const runEventRef = useRef<((ev: SceneEvent) => Promise<void>) | null>(null);
  const openShopRef = useRef<(() => Promise<void>) | null>(null);
  const locked = useRef(false);
  const activeEvent = useRef<SceneEvent | null>(null);
  const currentSceneToken = useRef(0);
  const maskCache = useRef<Map<number, Uint8Array>>(new Map());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoEventToken = useRef(0);

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

  useEffect(() => {
    loadGameData()
      .then((d) => {
        dataRef.current = d;
        setData(d);
        savesRef.current = readSaves();
        mutate((s) => ({ ...s, ready: true, screen: "title", titleCursor: 3 }));
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
      skills: [...c.skills],
      dead: false,
    };
  }, []);

  const recalcHp = useCallback((m: Member, level = m.level): Member => {
    const d = dataRef.current;
    if (!d) return m;
    const c = d.characters.get(m.name);
    const max = hpFor(c, d.hpLevels, level);
    const ratio = m.maxHp > 0 ? m.hp / m.maxHp : 1;
    return { ...m, level, maxHp: max, hp: Math.min(max, Math.max(0, Math.round(max * ratio))), dead: ratio <= 0 };
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
      atk: 28 + level * 2 + eq.atk,
      def: 22 + level * 2 + eq.def,
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
    let lv = level;
    let cur = exp + amount;
    const learnedSkills: string[] = [];
    const learnedFormations: string[] = [];
    for (let guard = 0; guard < 90; guard++) {
      const row = d.content.exp.levels[lv - 1];
      const next = row?.next ?? 0;
      if (!next || cur < next || lv >= 99) break;
      cur -= next;
      lv++;
      const newRow = d.content.exp.levels[lv - 1];
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
    const ix = Math.floor(x - map.x);
    const iy = Math.floor(map.y + map.h - 1 - y);
    if (ix < 0 || iy < 0 || ix >= map.w || iy >= map.h) return true;
    const bit = iy * map.w + ix;
    return !!(bytes[bit >> 3] & (1 << (bit & 7)));
  }, [decodeMask]);

  const spawnFor = useCallback((scene: Scene, tag?: string) => {
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
  }, []);

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
    const events = scene.events.filter((e) => {
      if (!e.id) return false;
      if (e.when !== 0 && e.when !== 5) return false;
      if (snapRef.current.flags[e.id]) return false;
      return dist(e.pos[0], e.pos[1], spawn.x, spawn.y) < 3.2;
    });
    if (events.length > 0) {
      const ev = events[0];
      setTimeout(() => {
        if (token !== currentSceneToken.current) return;
        runEventRef.current?.(ev);
      }, 420);
    }
  }, []);

  const loadScene = useCallback((level: number, tag?: string, keepPrevious = true) => {
    const d = currentData();
    const scene = d.scenes.find((s) => s.level === level) ?? d.scenes[0];
    if (!scene) return;
    const prev = snapRef.current;
    const spawn = spawnFor(scene, tag);
    const token = ++currentSceneToken.current;
    autoEventToken.current = token;
    mutate((s) => ({
      ...s,
      screen: "field",
      scene,
      previousLevel: keepPrevious && s.scene && s.scene.level !== level ? s.scene.level : s.previousLevel,
      x: spawn.x,
      y: spawn.y,
      dir: [0, -1],
      dialogue: null,
      panel: null,
      shop: null,
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
      loadScene(current.previousLevel, tag);
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

  const makeBattleUnits = useCallback((configEnemies: string[], formation: string) => {
    const d = currentData();
    const s = snapRef.current;
    const ch = d.content.chapters.find((c) => c.id === s.chapter) ?? d.content.chapters[0];
    const players: BattleUnit[] = s.party.filter((m) => !m.dead).map((m, index) => {
      const st = memberCombatStats(m);
      const skills = m.skills.filter((name) => {
        const sk = d.skills.get(name);
        return sk && sk.lv <= s.level;
      });
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
        skills,
        defending: false,
      };
    });
    const enemies: BattleUnit[] = configEnemies.map((name, index) => {
      const c = d.characters.get(name);
      const baseHp = ch?.hpList[index % Math.max(1, ch.hpList.length)] ?? 180;
      const maxHp = Math.max(baseHp, hpFor(c, d.hpLevels, s.level));
      const skillNames = c?.skills?.filter((sk) => (d.skills.get(sk)?.lv ?? 99) <= 3).slice(0, 4) ?? [];
      return {
        key: `e${index}`,
        side: "enemy",
        name: name || "兵士",
        profile: c?.profile ?? name,
        model: c?.modelTexture ?? null,
        hp: maxHp,
        maxHp,
        str: Math.max(ch?.str ?? 55, c?.stats[4] ?? 55),
        ler: Math.max(ch?.ler ?? 30, c?.stats[5] ?? 30),
        spd: Math.max(ch?.spd ?? 30, c?.stats[6] ?? 30),
        atk: Math.max(ch?.attack ?? 15, c?.stats[2] ?? 0) + s.level,
        def: Math.max(ch?.defense ?? 10, c?.stats[3] ?? 0) + s.level,
        skills: skillNames,
        defending: false,
      };
    });
    return { players, enemies, formation };
  }, [currentData, memberCombatStats]);

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
        if (menu === "formation") title = "变更阵型";
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

  const runBattle = useCallback(async (enemyNames: string[], config?: { money?: number; exp?: number; name?: string }) => {
    const s = snapRef.current;
    const { players, enemies } = makeBattleUnits(enemyNames.length ? enemyNames : ["兵士", "兵士"], s.formation);
    const units = [...players, ...enemies];
    locked.current = true;
    mutate((prev) => ({
      ...prev,
      screen: "battle",
      battle: {
        units: units.map((u) => ({ ...u })),
        round: 1,
        log: [`遭遇敌军：${enemyNames.join("、") || "兵士"}`, "战斗开始"],
        pending: null,
        menu: "command",
        cursor: 0,
        skill: null,
        menuTitle: "",
      },
    }));
    await sleep(500);

    const resultPromise = new Promise<number>((resolve) => { battleLoopResolve.current = resolve; });
    const formation = dataRef.current?.formations.get(s.formation);
    const formationAtk = formation?.flatMags?.[0]?.attack ?? 1;
    const formationHurt = formation?.flatMags?.[0]?.getHurt ?? 1;
    let round = 1;
    let finished = false;
    let fled = false;

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

    const damageOf = (attacker: BattleUnit, defender: BattleUnit, mult = 1) => {
      const level = snapRef.current.level;
      const atk = Math.max(1, attacker.atk);
      const str = Math.max(1, attacker.str);
      const hp = Math.min(65535, Math.max(1, attacker.hp));
      const def = Math.max(4, defender.def);
      const sideFactor = attacker.side === "player" ? 1 + level / 100 : 1;
      const base = (atk * str * hp) * (attacker.side === "player" ? 20 : 10) / def * sideFactor / 10000;
      const variance = 0.8 + Math.random() * 0.4;
      return Math.max(1, Math.round(base * variance * mult * formationAtk / formationHurt));
    };

    const skillDamage = (attacker: BattleUnit, defender: BattleUnit, sk: SkillData) => {
      if (sk.damageCoef > 0) {
        const raw = (sk.damageCoef * attacker.ler) / 3200;
        return Math.max(1, Math.round(raw * (0.85 + Math.random() * 0.3) * (1 + attacker.hp / Math.max(1, attacker.maxHp))));
      }
      return damageOf(attacker, defender, 1.25);
    };

    const hpAfter = (u: BattleUnit, nextHp: number): BattleUnit => ({ ...u, hp: clamp(Math.round(nextHp), 0, u.maxHp) });

    while (!finished) {
      const order = units.filter((u) => u.hp > 0).sort((a, b) => b.spd - a.spd || (a.side === "player" ? -1 : 1));
      for (const acting of order) {
        if (finished) break;
        const current = units.find((u) => u.key === acting.key);
        if (!current || current.hp <= 0) continue;
        if (current.side === "player") {
          current.defending = false;
          updateUnits(units);
          const action = await battlePrompt(current, "command");
          if (action.type === "attack") {
            const target = units.find((u) => u.key === action.target && u.side === "enemy" && u.hp > 0);
            if (target) {
              const dmg = damageOf(current, target, 1);
              Object.assign(target, hpAfter(target, target.hp - dmg));
              addLog(`${current.name} 攻击 ${target.name}，歼敌 ${Math.min(dmg, target.hp + dmg)}`);
            }
          } else if (action.type === "skill" && action.skill) {
            const sk = dataRef.current?.skills.get(action.skill);
            if (sk) {
              const cost = sk.cost;
              if (snapRef.current.mp >= cost) {
                mutate((prev) => ({ ...prev, mp: prev.mp - cost }));
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
                    const dmg = skillDamage(current, t, sk);
                    Object.assign(t, hpAfter(t, t.hp - dmg));
                    addLog(`${current.name} 施放 ${sk.name}，${t.name} 损失 ${dmg}`);
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
          } else if (action.type === "formation" && action.formation) {
            mutate((prev) => ({ ...prev, formation: action.formation!, battle: prev.battle ? { ...prev.battle, log: [`${current.name} 变更为 ${action.formation}`, ...prev.battle.log].slice(0, 8) } : prev.battle }));
            addLog(`${current.name} 变更为 ${action.formation}`);
          } else if (action.type === "defend") {
            current.defending = true;
            addLog(`${current.name} 进入防御`);
          } else if (action.type === "flee") {
            if (Math.random() < 0.35) {
              addLog("全军撤退成功");
              fled = true;
              finished = true;
              break;
            }
            addLog("撤退失败");
          }
        } else {
          await sleep(240 / Math.max(0.5, snapRef.current.speed));
          const alivePlayers = units.filter((u) => u.side === "player" && u.hp > 0);
          if (alivePlayers.length === 0) break;
          let target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
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
            const dmg = damageOf(current, target, (current as BattleUnit & { defending?: boolean }).defending ? 1.2 : 1);
            Object.assign(target, hpAfter(target, target.hp - dmg));
            addLog(`${current.name} 攻击 ${target.name}，${target.name} 损失 ${dmg}`);
          }
        }
        updateUnits(units);
        await sleep(360 / Math.max(0.5, snapRef.current.speed));
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
    const partyAfter = snapRef.current.party.map((m) => {
      const u = units.find((x) => x.side === "player" && x.name === m.name);
      if (!u) return m;
      return { ...m, hp: u.hp, maxHp: u.maxHp, dead: u.hp <= 0 };
    });
    const rewardMoney = won ? Math.max(20, (config?.money && config.money > 0 ? config.money : 0) + 30 + snapRef.current.level * 4) : 0;
    const rewardExp = won ? Math.max(12, config?.exp && config.exp > 0 ? config.exp : 8 + snapRef.current.level * 2) : 0;
    mutate((prev) => {
      let level = prev.level;
      let exp = prev.exp;
      let skillsLearned: string[] = [];
      let formationsLearned: string[] = [];
      if (rewardExp > 0) {
        const leveled = addExp(rewardExp, prev.level, prev.exp);
        level = leveled.level;
        exp = leveled.exp;
        skillsLearned = leveled.skills;
        formationsLearned = leveled.formations;
      }
      const party = partyAfter.map((m) => {
        const updated = recalcHp(m, level);
        const newSkills = skillsLearned.filter((s) => !updated.skills.includes(s));
        return { ...updated, level, skills: [...updated.skills, ...newSkills] };
      });
      return {
        ...prev,
        screen: escaped ? "field" : won ? "field" : "gameover",
        battle: null,
        party,
        level,
        exp,
        money: prev.money + rewardMoney,
        gameoverReason: escaped || won ? "" : "全军覆没",
        log: [...prev.log, `${config?.name ?? "战斗"}${escaped ? "撤退" : won ? "胜利" : "失败"}`].slice(-30),
      };
    });
    await sleep(450);
    locked.current = false;
    const result = escaped ? 2 : won ? 1 : 0;
    finishBattle(result);
    return result;
  }, [addExp, battlePrompt, finishBattle, makeBattleUnits, mutate, recalcHp]);

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
    const source = d.lua[`${ev.id}.lua`];
    if (!source) {
      if (ev.names.length) await talk(ev.names[0].name, ev.names[0].profile, "……");
      return false;
    }
    const leader = () => snapRef.current.party[0];
    const addFlag = (key: string) => mutate((prev) => ({ ...prev, flags: { ...prev.flags, [key]: true } }));
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
            const ids = flattenArgs(args).map(Number);
            const found: Member[] = [];
            for (const id of ids) {
              const c = [...d.characters.values()].find((x) => x.id === id);
              if (!c) continue;
              if (snapRef.current.party.some((m) => m.name === c.name)) continue;
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
            const last = positions[positions.length - 1];
            if (last && last.length >= 2) {
              mutate((prev) => ({ ...prev, x: last[0], y: last[1] }));
            }
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
          case "SetPosition":
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
            if (s.scene?.name.includes("宿") || s.scene?.name.includes("客栈")) return ["30"];
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
    if (snapRef.current.flags[ev.id]) return;
    locked.current = true;
    activeEvent.current = ev;
    const s = snapRef.current;
    if (s.dialogue) await talk("", null, "", false).catch(() => null);
    try {
      await executeLua(ev);
    } finally {
      activeEvent.current = null;
      locked.current = false;
      document.documentElement.dataset.kongmingLock = "false";
    }
  }, [executeLua, talk]);
  runEventRef.current = runEvent;

  const triggerOnEnter = useCallback(async (scene: Scene, x: number, y: number) => {
    if (locked.current) return;
    const s = snapRef.current;
    const trans = scene.transitions
      .filter((t) => t.when === 1 && dist(t.pos[0], t.pos[1], x, y) < 0.8)
      .sort((a, b) => dist(a.pos[0], a.pos[1], x, y) - dist(b.pos[0], b.pos[1], x, y))[0];
    if (trans) {
      locked.current = true;
      await sleep(260);
      loadSceneByName(trans.scene, trans.tag || undefined, trans.type);
      locked.current = false;
      return;
    }
    const ev = scene.events
      .filter((e) => (e.when === 1 || e.when === 3) && e.id && !s.flags[e.id] && dist(e.pos[0], e.pos[1], x, y) < 0.8)
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
    let shop = d.content.shops.find((x) => scene.includes("武器店") && x.name.includes("武器店"));
    if (!shop && scene.includes("道具")) shop = d.content.shops.find((x) => x.name.includes("道具店"));
    if (!shop) {
      const key = scene.replace(/[0-9#·一二三四五六七八九十]/g, "").slice(0, 2);
      shop = d.content.shops.find((x) => x.name.includes(key));
    }
    if (!shop) shop = d.content.shops[0];
    const items = shop.items.map((name) => {
      if (d.equipment.has(name)) return { name, price: d.equipment.get(name)!.price, kind: "equipment" as const };
      const item = d.items.get(name);
      return { name, price: item?.price ?? 50, kind: "item" as const };
    });
    mutate((prev) => ({ ...prev, shop: { title: shop!.name, items, cursor: 0 } }));
    return new Promise<void>((resolve) => { shopResolve.current = resolve; });
  }, [currentData, mutate]);

  openShopRef.current = openShop;

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
      return { ...prev, money: prev.money - entry.price, inventory: inv };
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

  const loadSave = useCallback((save: SavePayload) => {
    const d = currentData();
    const scene = d.scenes.find((x) => x.level === save.sceneLevel) ?? d.scenes[0];
    if (!scene) return;
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
      mp: save.mp,
      maxMp: save.maxMp,
      level: save.level,
      exp: save.exp,
      inventory: save.inventory,
      flags: save.flags,
      openedChests: save.openedChests,
      formation: save.formation,
      chapter: save.chapter,
      panel: null,
      dialogue: null,
      battle: null,
      shop: null,
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
    toast(`阵型变更为 ${name}`);
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
      mp: start.maxMp,
      maxMp: start.maxMp,
      level: start.lv,
      exp: start.exp,
      flags: {},
      openedChests: {},
      formation: start.defaultFormation,
      chapter: 1,
      dialogue: null,
      panel: null,
      shop: null,
      battle: null,
      log: ["新游戏 · 序"],
    }));
    const startScene = d.scenes.find((s) => s.level === 12);
    if (startScene) {
      // The prologue is rendered first; the first playable scene is 徐州宫殿.
    }
  }, [autoEquip, currentData, makeMember, mutate]);

  const proceedPrologue = useCallback(() => {
    const s = snapRef.current;
    if (s.prologuePage < PROLOGUE.length - 1) {
      mutate((prev) => ({ ...prev, prologuePage: prev.prologuePage + 1 }));
      return;
    }
    const d = currentData();
    const start = d.scenes.find((x) => x.level === 12) ?? d.scenes[0];
    if (!start) return;
    loadScene(start.level, "开场", false);
    banner("第一章　徐州沉浮");
  }, [banner, currentData, loadScene, mutate]);

  /* ------------------------------------------------------------------ */
  /* Terminal / input                                                    */
  /* ------------------------------------------------------------------ */

  const boxed = useCallback(() => {
    const s = snapRef.current;
    return s.screen === "field" && !s.panel && !s.shop && !s.battle;
  }, []);

  const move = useCallback((dx: number, dy: number) => {
    const s = snapRef.current;
    if (!boxed() || !s.scene || locked.current) return;
    const nx = s.x + dx;
    const ny = s.y + dy;
    mutate((prev) => ({ ...prev, dir: [dx, dy], x: nx, y: ny }));
    if (blockedAt(s.scene, nx, ny)) {
      mutate((prev) => ({ ...prev, x: s.x, y: s.y }));
      toast("前方无法通行");
      return;
    }
    void triggerOnEnter(s.scene, nx, ny);
  }, [blockedAt, boxed, mutate, toast, triggerOnEnter]);

  const interact = useCallback(async () => {
    const s = snapRef.current;
    if (!s.scene || locked.current) return;
    const scene = s.scene;

    const ev = scene.events
      .filter((e) => e.when === 2 && e.id && !s.flags[e.id] && dist(e.pos[0], e.pos[1], s.x, s.y) < 1.1)
      .sort((a, b) => dist(a.pos[0], a.pos[1], s.x, s.y) - dist(b.pos[0], b.pos[1], s.x, s.y))[0];
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

    const nearbyEvent = scene.events
      .filter((e) => e.id && !s.flags[e.id] && !e.startHide && dist(e.pos[0], e.pos[1], s.x, s.y) < 2.0)
      .sort((a, b) => dist(a.pos[0], a.pos[1], s.x, s.y) - dist(b.pos[0], b.pos[1], s.x, s.y))[0];
    if (nearbyEvent) {
      await talk(nearbyEvent.names[0]?.name ?? "路人", nearbyEvent.names[0]?.profile ?? null, "……");
      return;
    }
    toast("这里没有可以调查的东西");
  }, [loadSceneByName, mutate, runEvent, toast, talk]);

  const handleKey = useCallback(async (e: KeyboardEvent) => {
    if (e.repeat && !["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) return;
    const s = snapRef.current;
    const key = e.code;
    const isDir = ["KeyW", "KeyA", "KeyS", "KeyD"].includes(key);
    if (isDir || ["KeyJ", "KeyK"].includes(key)) e.preventDefault();

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

    if (s.battle) {
      const b = s.battle;
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
        if (b.menu === "formation") return Math.max(1, dataRef.current?.content.formations.length ?? 1);
        return 6;
      };
      if (key === "KeyW") mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, cursor: (prev.battle.cursor + cursorMax() - 1) % cursorMax() } } : prev);
      else if (key === "KeyS") mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, cursor: (prev.battle.cursor + 1) % cursorMax() } } : prev);
      else if (key === "KeyK") {
        if (b.menu !== "command") mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, menu: "command", cursor: 0, skill: null } } : prev);
      } else if (key === "KeyJ") {
        const resolve = battleResolve.current;
        if (b.menu === "command") {
          if (b.cursor === 0) mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, menu: "attack", cursor: 0 } } : prev);
          else if (b.cursor === 1) {
            if (skills.length === 0) toast("尚未习得计策");
            else mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, menu: "skill", cursor: 0 } } : prev);
          } else if (b.cursor === 2) {
            if (items.length === 0) toast("没有可用物品");
            else mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, menu: "item", cursor: 0 } } : prev);
          } else if (b.cursor === 3) mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, menu: "formation", cursor: 0 } } : prev);
          else if (b.cursor === 4) { battleResolve.current = null; mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, pending: null, menu: "command" } } : prev); resolve?.({ type: "defend" }); }
          else if (b.cursor === 5) { battleResolve.current = null; mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, pending: null, menu: "command" } } : prev); resolve?.({ type: "flee" }); }
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
            const target = s.party[0];
            battleResolve.current = null;
            mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, pending: null, menu: "command" } } : prev);
            resolve?.({ type: "item", item: item.name, target: `p0` });
            void target;
          }
        } else if (b.menu === "formation") {
          const f = dataRef.current?.content.formations[b.cursor];
          if (f) {
            battleResolve.current = null;
            mutate((prev) => prev.battle ? { ...prev, battle: { ...prev.battle, pending: null, menu: "command" } } : prev);
            resolve?.({ type: "formation", formation: f.name });
          }
        }
      }
      return;
    }

    if (s.panel) {
      const p = s.panel;
      const rootItems: PanelKind[] = ["party", "inventory", "equipment", "skills", "formations", "story", "save", "settings"];
      if (p.kind === "root") {
        if (key === "KeyK") { closePanel(); return; }
        if (key === "KeyW" || key === "KeyS") {
          mutate((prev) => prev.panel ? { ...prev, panel: { ...prev.panel, cursor: (prev.panel.cursor + (key === "KeyW" ? 8 : 1)) % 9 } } : prev);
          return;
        }
        if (key === "KeyJ") {
          if (p.cursor === 8) { closePanel(); return; }
          openPanel(rootItems[p.cursor]);
          return;
        }
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
        const skills = member?.skills ?? [];
        if (key === "KeyW" || key === "KeyS") mutate((prev) => prev.panel ? { ...prev, panel: { ...prev.panel, cursor: (prev.panel.cursor + (key === "KeyW" ? Math.max(1, skills.length) - 1 : 1)) % Math.max(1, skills.length) } } : prev);
        if (key === "KeyJ") { const sk = skills[p.cursor]; if (sk) useSkillInfo(sk); }
        return;
      }
      if (p.kind === "formations") {
        const formations = dataRef.current?.content.start.formations ?? [];
        const owned = dataRef.current?.content.start.formations ?? [];
        if (key === "KeyW" || key === "KeyS") mutate((prev) => prev.panel ? { ...prev, panel: { ...prev.panel, cursor: (prev.panel.cursor + (key === "KeyW" ? Math.max(1, owned.length) - 1 : 1)) % Math.max(1, owned.length) } } : prev);
        if (key === "KeyJ") { const f = owned[p.cursor]; if (f) changeFormation(f); }
        void formations;
        return;
      }
      if (p.kind === "save" || p.kind === "load") {
        if (key === "KeyW" || key === "KeyS") mutate((prev) => prev.panel ? { ...prev, panel: { ...prev.panel, cursor: (prev.panel.cursor + (key === "KeyW" ? 2 : 1)) % 3 } } : prev);
        if (key === "KeyJ") {
          const slot = p.cursor;
          if (p.kind === "save") saveGame(slot);
          else {
            const save = savesRef.current[slot];
            if (save) loadSave(save);
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
      if (key === "KeyW" || key === "KeyS") mutate((prev) => ({ ...prev, titleCursor: (prev.titleCursor + (key === "KeyW" ? 3 : 1)) % 4 }));
      if (key === "KeyJ") {
        if (s.titleCursor === 0) toast("请直接关闭本页面退出");
        else if (s.titleCursor === 1) openPanel("settings");
        else if (s.titleCursor === 2) openPanel("load");
        else if (s.titleCursor === 3) startNewGame();
      }
      if (key === "KeyK") return;
      return;
    }

    if (s.screen === "prologue") {
      if (key === "KeyJ") proceedPrologue();
      if (key === "KeyK") {
        const d = currentData();
        const start = d.scenes.find((x) => x.level === 12) ?? d.scenes[0];
        if (start) { loadScene(start.level, "开场", false); banner("第一章　徐州沉浮"); }
      }
      return;
    }

    if (s.screen === "gameover") {
      if (key === "KeyJ") mutate((prev) => ({ ...prev, screen: "title", scene: null, party: [], battle: null }));
      return;
    }

    if (s.screen === "field" && !s.panel && !s.shop && !s.battle) {
      if (key === "KeyW") move(0, 1);
      else if (key === "KeyA") move(-1, 0);
      else if (key === "KeyS") move(0, -1);
      else if (key === "KeyD") move(1, 0);
      else if (key === "KeyJ") void interact();
      else if (key === "KeyK") openPanel("root");
    }
  }, [banner, buyShopItem, changeFormation, closePanel, closeShop, currentData, equipItem, finishDialogue, loadSave, loadScene, move, mutate, openPanel, proceedPrologue, saveGame, startNewGame, toast, useInventoryItem, useSkillInfo, interact]);

  useEffect(() => {
    const listener = (e: KeyboardEvent) => { void handleKey(e); };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [handleKey]);

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  }, []);

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
  const viewW = 960;
  const viewH = 540;
  const baseCell = map?.scale ?? 32;
  const baseW = map ? map.w * baseCell : 0;
  const baseH = map ? map.h * baseCell : 0;
  const zoom = map ? Math.max(1, viewW / Math.max(1, baseW), viewH / Math.max(1, baseH)) : 1;
  const cell = baseCell * zoom;
  const mapW = map ? map.w * cell : 0;
  const mapH = map ? map.h * cell : 0;
  let camX = 0;
  let camY = 0;
  let playerSX = 0;
  let playerSY = 0;
  if (scene && map) {
    const rawX = (s.x - map.x) * cell;
    const rawY = (map.y + map.h - s.y) * cell;
    camX = mapW <= viewW ? (mapW - viewW) / 2 : clamp(rawX - viewW / 2, 0, mapW - viewW);
    camY = mapH <= viewH ? (mapH - viewH) / 2 : clamp(rawY - viewH / 2, 0, mapH - viewH);
    playerSX = rawX - camX;
    playerSY = rawY - camY;
  }
  const sx = (gx: number) => (map ? (gx - map.x) * cell - camX : 0);
  const sy = (gy: number) => (map ? (map.y + map.h - gy) * cell - camY : 0);

  const seenEvents = new Set<string>();
  const fieldEvents = (scene?.events ?? []).filter((e) => {
    if (!e.id || s.flags[e.id] || e.startHide || !e.names.length) return false;
    const k = `${e.id}:${e.pos[0]}:${e.pos[1]}`;
    if (seenEvents.has(k)) return false;
    seenEvents.add(k);
    return true;
  });
  const fieldChests = (scene?.chests ?? []).filter((c) => c.show && !s.openedChests[c.id]);
  const leader = s.party[0];
  const playerSprite = spriteForModel(leader?.model);
  const playerFrame = frameForDir(s.dir);
  const titleLabels = ["退出", "设置", "读取存档", "新游戏"];
  const rootLabels = ["队伍", "物品", "装备", "谋略", "阵型", "剧情", "保存", "设置", "返回"];
  const panelTitle: Record<string, string> = {
    root: "军帐",
    party: "队伍",
    inventory: "物品",
    equipment: "装备",
    skills: "谋略",
    formations: "阵型",
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
  const battleCommands = ["攻击", "计策", "物品", "阵型", "防御", "撤退"];
  const equipmentInv = s.inventory.filter((i) => data.equipment.has(i.name));

  return (
    <div className={styles.root}>
      <div className={`${styles.frame} ${s.shake ? styles.shake : ""}`}>
        {s.screen === "loading" && (
          <div className={styles.loading}>
            <div className={styles.loadingMark}>孔</div>
            <p>正在展开舆图……</p>
          </div>
        )}

        {s.screen === "title" && (
          <div className={styles.titleScreen}>
            <div className={styles.titleWash} />
            <div className={styles.titleClouds} />
            <div className={styles.titleTags} aria-hidden>
              <span>初出茅庐</span>
              <span>匡扶汉室</span>
              <span>厉兵秣马</span>
              <span>解甲归田</span>
            </div>
            <div className={styles.titleSeal}>汉</div>
            <div className={styles.titleMain}>
              <p className={styles.titleKicker}>三国志通俗演义 · 刘备传</p>
              <h1 className={styles.titleText}>诸葛孔明传</h1>
              <div className={styles.titleRule} />
              <p className={styles.titleSub}>吞食天地２ · 怀旧版复刻</p>
              <ul className={styles.titleMenu}>
                {titleLabels.map((label, i) => (
                  <li key={label} className={s.titleCursor === i ? styles.menuOn : undefined}>
                    <span className={styles.menuArrow}>{s.titleCursor === i ? "◆" : ""}</span>
                    {label}
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.titleFoot}>
              <span>W/S 选择　J 确认</span>
              <Link href="/dashboard">返回网站</Link>
            </div>
          </div>
        )}

        {s.screen === "prologue" && (
          <div className={styles.prologueScreen}>
            <div className={styles.prologuePaper}>
              <div className={styles.prologueHead}>序</div>
              <p className={styles.prologueText}>{PROLOGUE[s.prologuePage]}</p>
              <div className={styles.prologueFoot}>
                <span>{s.prologuePage + 1} / {PROLOGUE.length}</span>
                <span>J 继续　K 跳过</span>
              </div>
            </div>
          </div>
        )}

        {(s.screen === "field" || s.screen === "battle" || s.screen === "gameover") && scene && map && (
          <div className={styles.field}>
            <svg className={styles.world} viewBox={`0 0 ${viewW} ${viewH}`} preserveAspectRatio="xMidYMid slice">
              <rect width={viewW} height={viewH} fill="#10130f" />
              <image
                href={map.src}
                x={-camX}
                y={-camY}
                width={mapW}
                height={mapH}
                className={styles.pixel}
                preserveAspectRatio="none"
              />
              {fieldEvents.map((e, i) => {
                const ex = sx(e.pos[0]);
                const ey = sy(e.pos[1]);
                if (ex < -80 || ex > viewW + 80 || ey < -100 || ey > viewH + 80) return null;
                const face = faceForProfile(e.names[0]?.profile);
                return (
                  <g key={`${e.id}-${i}`}>
                    <ellipse cx={ex} cy={ey + 4} rx={22} ry={8} fill="rgba(0,0,0,.35)" />
                    {face ? (
                      <image href={face} x={ex - 21} y={ey - 54} width={42} height={42} preserveAspectRatio="xMidYMid slice" />
                    ) : (
                      <circle cx={ex} cy={ey - 33} r={21} fill="#4a3a27" stroke="#c9a86a" strokeWidth={1.5} />
                    )}
                    <text x={ex} y={ey - 62} textAnchor="middle" fill="#f5e7c8" fontSize={12} stroke="#20150b" strokeWidth={3} paintOrder="stroke">
                      {e.names[0]?.name ?? "人"}
                    </text>
                  </g>
                );
              })}
              {fieldChests.map((c) => {
                const cx = sx(c.pos[0]);
                const cy = sy(c.pos[1]);
                return (
                  <g key={c.id}>
                    <ellipse cx={cx} cy={cy + 4} rx={13} ry={5} fill="rgba(0,0,0,.35)" />
                    <rect x={cx - 11} y={cy - 18} width={22} height={18} rx={2} fill="#8a5b26" stroke="#e2b865" strokeWidth={1.5} />
                    <rect x={cx - 2} y={cy - 18} width={4} height={18} fill="#e2b865" />
                    <text x={cx} y={cy - 26} textAnchor="middle" fill="#f5e7c8" fontSize={11} stroke="#20150b" strokeWidth={3} paintOrder="stroke">宝</text>
                  </g>
                );
              })}
              <ellipse cx={playerSX} cy={playerSY + 4} rx={22} ry={8} fill="rgba(0,0,0,.45)" />
              {playerSprite ? (
                <svg x={playerSX - 32} y={playerSY - 58} width={64} height={64} viewBox={`${playerFrame * 69} 0 69 69`} preserveAspectRatio="xMidYMid meet">
                  <image href={playerSprite} x={0} y={0} width={552} height={69} className={styles.pixel} />
                </svg>
              ) : (
                <circle cx={playerSX} cy={playerSY - 26} r={22} fill="#294b63" stroke="#d8c38f" strokeWidth={2} />
              )}
              {!playerSprite && (
                <text x={playerSX} y={playerSY - 20} textAnchor="middle" fill="#fff" fontSize={15}>{leader?.name?.[0] ?? "刘"}</text>
              )}
              <text x={playerSX} y={playerSY - 64} textAnchor="middle" fill="#fff6df" fontSize={12} stroke="#1c140b" strokeWidth={3} paintOrder="stroke">
                {leader?.name ?? ""}
              </text>
            </svg>

            <div className={styles.hudTop}>
              <div className={styles.hudChapter}>
                <span className={styles.hudSmall}>{chapterName(s.chapter)}</span>
                <strong>{sceneLabel(scene)}</strong>
              </div>
              <div className={styles.hudStats}>
                <span>金 <b>{s.money}</b></span>
                <span>等级 <b>{s.level}</b></span>
                <span>计力 <b>{s.mp}/{s.maxMp}</b></span>
              </div>
            </div>

            <div className={styles.partyBar}>
              {s.party.map((m) => {
                const face = faceForProfile(m.profile);
                return (
                  <div key={m.key} className={`${styles.partyChip} ${m.dead ? styles.partyDead : ""}`}>
                    {face ? <img src={face} alt="" /> : <span className={styles.faceFallback}>{m.name[0]}</span>}
                    <div>
                      <span className={styles.partyName}>{m.name}</span>
                      <span className={styles.hpLine}>
                        <i style={{ width: `${m.maxHp ? (m.hp / m.maxHp) * 100 : 0}%` }} />
                      </span>
                      <small>{m.hp} / {m.maxHp}</small>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.keyHint}>WASD 移动　J 调查 / 确认　K 军帐</div>
          </div>
        )}

        {s.screen === "battle" && battle && (
          <div className={styles.battleScreen}>
            <div className={styles.battleSky} />
            <div className={styles.battleHeader}>
              <span>会战</span>
              <strong>第 {battle.round} 回合</strong>
            </div>
            <div className={styles.battleArena}>
              <div className={styles.battleSide}>
                {battle.units.filter((u) => u.side === "player").map((u) => (
                  <div key={u.key} className={`${styles.unitCard} ${u.hp <= 0 ? styles.unitDown : ""} ${battle.pending === u.key ? styles.unitActive : ""}`}>
                    {faceForProfile(u.profile) ? <img src={faceForProfile(u.profile)!} alt="" /> : <span className={styles.faceFallback}>{u.name[0]}</span>}
                    <div className={styles.unitInfo}>
                      <span>{u.name}</span>
                      <small>{u.hp} / {u.maxHp}</small>
                      <i><b style={{ width: `${u.maxHp ? (u.hp / u.maxHp) * 100 : 0}%` }} /></i>
                    </div>
                  </div>
                ))}
              </div>
              <div className={styles.vsMark}>战</div>
              <div className={styles.battleSide}>
                {battle.units.filter((u) => u.side === "enemy").map((u) => {
                  const idx = enemies.findIndex((e) => e.key === u.key);
                  const lit = (battle.menu === "attack" || battle.menu === "target") && idx === battle.cursor;
                  return (
                    <div key={u.key} className={`${styles.unitCard} ${styles.enemyCard} ${u.hp <= 0 ? styles.unitDown : ""} ${lit ? styles.unitActive : ""}`}>
                      {faceForProfile(u.profile) ? <img src={faceForProfile(u.profile)!} alt="" /> : <span className={styles.faceFallback}>{u.name[0]}</span>}
                      <div className={styles.unitInfo}>
                        <span>{u.name}</span>
                        <small>{u.hp} / {u.maxHp}</small>
                        <i><b style={{ width: `${u.maxHp ? (u.hp / u.maxHp) * 100 : 0}%` }} /></i>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={styles.battleLog}>
              {battle.log.slice(-4).map((line, i) => <p key={i}>{line}</p>)}
            </div>

            {battle.menu === "command" && (
              <div className={styles.commandBox}>
                <div className={styles.commandHead}>{pendingUnit?.name ?? "武将"} 的指令</div>
                <div className={styles.commandGrid}>
                  {battleCommands.map((label, i) => (
                    <div key={label} className={battle.cursor === i ? styles.commandOn : undefined}>
                      <span>{battle.cursor === i ? "▶" : ""}</span>{label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {battle.menu === "attack" && (
              <div className={styles.commandBox}>
                <div className={styles.commandHead}>选择目标</div>
                <div className={styles.commandList}>
                  {enemies.map((u, i) => (
                    <div key={u.key} className={battle.cursor === i ? styles.commandOn : undefined}>
                      <span>{battle.cursor === i ? "▶" : ""}</span>{u.name}　{u.hp}
                    </div>
                  ))}
                </div>
                <small>J 攻击　K 返回</small>
              </div>
            )}

            {battle.menu === "skill" && (
              <div className={styles.commandBox}>
                <div className={styles.commandHead}>选择计策</div>
                <div className={styles.commandList}>
                  {battleSkills.map((name, i) => {
                    const sk = data.skills.get(name);
                    return (
                      <div key={name} className={battle.cursor === i ? styles.commandOn : undefined}>
                        <span>{battle.cursor === i ? "▶" : ""}</span>{name}
                        <em>{sk?.cost ? `${sk.cost} 计力` : ""}</em>
                      </div>
                    );
                  })}
                </div>
                <small>J 使用　K 返回</small>
              </div>
            )}

            {battle.menu === "target" && (
              <div className={styles.commandBox}>
                <div className={styles.commandHead}>{battle.skill} · 选择目标</div>
                <div className={styles.commandList}>
                  {enemies.map((u, i) => (
                    <div key={u.key} className={battle.cursor === i ? styles.commandOn : undefined}>
                      <span>{battle.cursor === i ? "▶" : ""}</span>{u.name}　{u.hp}
                    </div>
                  ))}
                </div>
                <small>J 确认　K 返回</small>
              </div>
            )}

            {battle.menu === "item" && (
              <div className={styles.commandBox}>
                <div className={styles.commandHead}>使用物品</div>
                <div className={styles.commandList}>
                  {battleItems.map((it, i) => (
                    <div key={it.name} className={battle.cursor === i ? styles.commandOn : undefined}>
                      <span>{battle.cursor === i ? "▶" : ""}</span>{it.name} × {it.count}
                    </div>
                  ))}
                </div>
                <small>J 使用于 {leader?.name}　K 返回</small>
              </div>
            )}

            {battle.menu === "formation" && (
              <div className={styles.commandBox}>
                <div className={styles.commandHead}>变更阵型</div>
                <div className={styles.commandList}>
                  {data.content.formations.map((f, i) => (
                    <div key={f.name} className={battle.cursor === i ? styles.commandOn : undefined}>
                      <span>{battle.cursor === i ? "▶" : ""}</span>{f.name}
                    </div>
                  ))}
                </div>
                <small>J 变阵　K 返回</small>
              </div>
            )}
          </div>
        )}

        {s.screen === "gameover" && (
          <div className={styles.gameover}>
            <div className={styles.gameoverCard}>
              <h2>全军覆没</h2>
              <p>{s.gameoverReason || "刘玄德兵败，只得暂避锋芒。"}</p>
              <span>J 返回标题</span>
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
                    <li key={label} className={panel.cursor === i ? styles.menuOn : undefined}>
                      <span>{panel.cursor === i ? "◆" : ""}</span>{label}
                    </li>
                  ))}
                </ul>
              )}

              {panel.kind === "party" && (
                <div className={styles.panelBody}>
                  {s.party.map((m, i) => (
                    <div key={m.key} className={`${styles.partyRow} ${panel.cursor === i ? styles.rowOn : ""}`}>
                      <b>{m.name}</b>
                      <span>Lv {m.level}</span>
                      <span>{m.hp} / {m.maxHp}</span>
                      <span>{m.dead ? "重伤" : "可战"}</span>
                    </div>
                  ))}
                  {s.party.length === 0 && <p className={styles.emptyText}>尚无武将</p>}
                </div>
              )}

              {panel.kind === "inventory" && (
                <div className={styles.panelBody}>
                  <div className={styles.moneyLine}>所持金 <b>{s.money}</b></div>
                  {s.inventory.map((it, i) => (
                    <div key={it.name} className={`${styles.listRow} ${panel.cursor === i ? styles.rowOn : ""}`}>
                      <span>{it.name}</span><span>× {it.count}</span>
                    </div>
                  ))}
                  {s.inventory.length === 0 && <p className={styles.emptyText}>囊中空空</p>}
                </div>
              )}

              {panel.kind === "equipment" && (
                <div className={styles.panelBody}>
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
                          <div key={it.name} className={`${styles.listRow} ${panel.cursor === i ? styles.rowOn : ""}`}>
                            <span>{it.name}</span><span>× {it.count}</span>
                          </div>
                        ))}
                        {equipmentInv.length === 0 && <p className={styles.emptyText}>没有可换装备</p>}
                      </>
                    );
                  })()}
                </div>
              )}

              {panel.kind === "skills" && (
                <div className={styles.panelBody}>
                  {(s.party[panel.member ?? 0]?.skills ?? []).map((name, i) => (
                    <div key={name} className={`${styles.listRow} ${panel.cursor === i ? styles.rowOn : ""}`}>
                      <span>{name}</span><span>{data.skills.get(name)?.cost ?? 0} 计力</span>
                    </div>
                  ))}
                </div>
              )}

              {panel.kind === "formations" && (
                <div className={styles.panelBody}>
                  <div className={styles.moneyLine}>当前阵型 <b>{s.formation}</b></div>
                  {data.content.start.formations.map((name, i) => (
                    <div key={name} className={`${styles.listRow} ${panel.cursor === i ? styles.rowOn : ""}`}>
                      <span>{name}</span><span>{name === s.formation ? "使用中" : "J 变阵"}</span>
                    </div>
                  ))}
                </div>
              )}

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
              <div className={styles.panelHead}><h2>{s.shop.title}</h2><span>所持 {s.money} 金</span></div>
              <div className={styles.panelBody}>
                {s.shop.items.map((it, i) => (
                  <div key={it.name} className={`${styles.listRow} ${s.shop?.cursor === i ? styles.rowOn : ""}`}>
                    <span>{it.name}</span><span>{it.price} 金</span>
                  </div>
                ))}
              </div>
              <div className={styles.panelFoot}>J 购买　K 离开</div>
            </div>
          </div>
        )}

        {s.dialogue && (
          <div className={styles.dialogueLayer}>
            <div className={styles.dialogueBox}>
              {faceForProfile(s.dialogue.profile) && (
                <img className={styles.dialogueFace} src={faceForProfile(s.dialogue.profile)!} alt="" />
              )}
              <div className={styles.dialogueName}>{s.dialogue.name}</div>
              <p className={styles.dialogueText}>{s.dialogue.text}</p>
              {s.dialogue.ask ? (
                <div className={styles.choices}>
                  {["是", "否"].map((label, i) => (
                    <span key={label} className={s.dialogue?.choice === i ? styles.choiceOn : undefined}>
                      {s.dialogue?.choice === i ? "◆ " : ""}{label}
                    </span>
                  ))}
                </div>
              ) : (
                <div className={styles.dialogueNext}>J 继续</div>
              )}
            </div>
          </div>
        )}

        {s.banner && <div className={styles.banner}>{s.banner}</div>}
        {s.toast && <div className={styles.toast}>{s.toast}</div>}
        {s.faded && <div className={styles.fade} />}
      </div>
    </div>
  );
}
