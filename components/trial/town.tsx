"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { SAGA_NPCS } from "@/lib/trial/saga/story";
import { Button } from "@/components/ui/button";
import {
  paintHeroSprite,
  VIEW_H,
  VIEW_W,
  type FieldFacing,
  type FieldFacilityId,
} from "./renderer";
import { SagaPortrait } from "./scenes";

/**
 * 城中街景：北排皇宫与铺面、南排铺面围出一座二维城镇，玩家四向走动。
 * 两排之间是石板广场，南排背后是南街；南北两排的门口都朝南。
 * 走到门口按 E 进店；店里走到柜台前与掌柜说话、办正事。
 *
 * 街景与内景都用 Canvas 现画，逻辑坐标固定 960×540（按 DPR 放大位图），
 * 镜头双向跟随走位。交互点、遮挡与柜台位置都在此文件里，服务端不参与。
 */

const TOWN_W = 1440;
const TOWN_H = 1180;
const WALK_LEFT = 40;
const WALK_RIGHT = 1400;
const WALK_TOP = 336;
const WALK_BOTTOM = 1150;
const SHOP_WALK_TOP = 340;
const ROOM_WALK_TOP = 340;
const ROOM_WALK_BOTTOM = 512;
const ROOM_EXIT_X = 480;
const SHOP_LEFT = 104;
const SHOP_RIGHT = 856;
const PALACE_LEFT = 130;
const PALACE_RIGHT = 830;

const townFont = (size: number): string =>
  `600 ${size}px "Noto Serif SC", "Songti SC", "STSong", serif`;

type ShopId =
  | "forge"
  | "herb"
  | "supply"
  | "inn"
  | "bank"
  | "coupon"
  | "train"
  | "hall"
  | "tavern";

type Scene = { kind: "street" } | { kind: "shop"; id: ShopId } | { kind: "palace" };

interface StreetSpot {
  id: FieldFacilityId | "palace";
  label: string;
  x: number;
  /** 门脸基线（门口所在的世界 y）。 */
  y: number;
  width: number;
  /** 门脸向上占的高度，南排要按它挡住走位。 */
  height: number;
  kind: "shop" | "palace" | "monument" | "tent" | "gate";
  accent: string;
  roof: string;
}

const STREET_SPOTS: StreetSpot[] = [
  // 北排：坐北朝南，分列皇宫两侧，中间让出通往城门的中轴主街
  { id: "forge", label: "铁匠铺", x: 170, y: 300, width: 124, height: 180, kind: "shop", accent: "#c2703a", roof: "#564337" },
  { id: "herb", label: "药铺", x: 330, y: 300, width: 124, height: 180, kind: "shop", accent: "#7f9a54", roof: "#4a4a38" },
  { id: "supply", label: "军需帐", x: 490, y: 300, width: 124, height: 180, kind: "shop", accent: "#b08a4e", roof: "#54473a" },
  { id: "palace", label: "皇宫", x: 740, y: 300, width: 250, height: 220, kind: "palace", accent: "#b23a32", roof: "#5c2a22" },
  { id: "inn", label: "客栈", x: 1010, y: 300, width: 124, height: 180, kind: "shop", accent: "#c99a5b", roof: "#5a4636" },
  { id: "bank", label: "钱庄", x: 1170, y: 300, width: 124, height: 180, kind: "shop", accent: "#b9a05a", roof: "#4a4236" },
  { id: "coupon", label: "活动券", x: 1330, y: 300, width: 124, height: 180, kind: "shop", accent: "#c98a9a", roof: "#54403e" },
  // 南排：门脸朝南，左三右二，中间留出中轴与城门前的空地
  { id: "train", label: "训练场", x: 206, y: 880, width: 124, height: 180, kind: "shop", accent: "#a2623a", roof: "#4f4033" },
  { id: "hall", label: "编成所", x: 366, y: 880, width: 124, height: 180, kind: "shop", accent: "#7f8f5a", roof: "#474a3a" },
  { id: "tavern", label: "酒馆", x: 526, y: 880, width: 124, height: 180, kind: "shop", accent: "#c07a4a", roof: "#5a4436" },
  { id: "tent", label: "营帐", x: 916, y: 880, width: 146, height: 150, kind: "tent", accent: "#a87947", roof: "#6b5a3f" },
  { id: "record", label: "桃园碑", x: 1096, y: 880, width: 92, height: 120, kind: "monument", accent: "#b9a05a", roof: "#4a4438" },
  // 城门压在中轴最南端，是可穿行的门洞（不参与碰撞）
  { id: "gate", label: "城门", x: 740, y: 1080, width: 190, height: 170, kind: "gate", accent: "#a87947", roof: "#4a4238" },
];

const SPOT_BY_ID = new Map(STREET_SPOTS.map((spot) => [spot.id, spot]));

const SHOP_IDS = new Set<string>([
  "forge",
  "herb",
  "supply",
  "inn",
  "bank",
  "coupon",
  "train",
  "hall",
  "tavern",
]);

function isShopId(id: StreetSpot["id"]): id is ShopId {
  return SHOP_IDS.has(id);
}

interface StreetWalker {
  npcId: string;
  name: string;
  title: string;
  color: string;
  accent: string;
  baseX: number;
  range: number;
  y: number;
  speed: number;
  phase: number;
  scale: number;
  hat: boolean;
  staff: boolean;
  basket: boolean;
  lines: string[];
}

const STREET_WALKERS: StreetWalker[] = [
  {
    npcId: "street-ward",
    name: "里正",
    title: "街口里正",
    color: "#6f5a3a",
    accent: "#e3c98e",
    baseX: 740,
    range: 190,
    y: 500,
    speed: 0.24,
    phase: 0.4,
    scale: 1,
    hat: false,
    staff: true,
    basket: false,
    lines: [
      "这条街上的铺子都还开着。将军要办什么，尽管去。",
      "出城前把甲带系紧。外头的营寨，一座比一座难啃。",
    ],
  },
  {
    npcId: "street-flower",
    name: "卖花女",
    title: "街边小贩",
    color: "#8f4a52",
    accent: "#f2c9c0",
    baseX: 500,
    range: 90,
    y: 660,
    speed: 0.34,
    phase: 1.9,
    scale: 0.94,
    hat: false,
    staff: false,
    basket: true,
    lines: [
      "将军买枝花么？不要钱，插在盔上也好看。",
      "前头又打起来了，街上的人少了一半。",
    ],
  },
  {
    npcId: "street-kid",
    name: "小童",
    title: "街口孩童",
    color: "#4e6a8a",
    accent: "#cfe4f2",
    baseX: 960,
    range: 90,
    y: 660,
    speed: 0.46,
    phase: 4.2,
    scale: 0.8,
    hat: false,
    staff: false,
    basket: false,
    lines: ["我长大也要当将军！", "娘说将军的队伍不抢东西，是真的吗？"],
  },
];

interface StreetProp {
  id: string;
  label: string;
  npcId: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
}

const STREET_PROPS: StreetProp[] = [
  {
    id: "notice",
    label: "告示牌",
    npcId: "street-notice",
    title: "城中告示",
    x: 884,
    y: 620,
    w: 28,
    h: 30,
    lines: ["榜文上写着募兵的名目，墨迹被露水洇开了一角。", "落款是本地县衙，末尾还按着一方朱印。"],
  },
  {
    id: "well",
    label: "水井",
    npcId: "street-well",
    title: "街口水井",
    x: 596,
    y: 620,
    w: 44,
    h: 30,
    lines: ["井台边的青石被绳子磨出了槽。", "木桶还挂在轱辘上，井水映着一小片天。"],
  },
];

interface PalaceLord {
  npcId: string;
  name: string;
  title: string;
  greeting: string;
  lines: string[];
}

const PALACE_LORDS: PalaceLord[] = [
  {
    npcId: "lord-liuyan",
    name: "刘焉",
    title: "幽州牧",
    greeting: "玄德来得正好。黄巾势大，涿郡的丁口与粮草，我尽数托付给你。",
    lines: [
      "宗室子弟里，肯实心任事的不多。这面讨逆旗，你举得起。",
      "破了广宗，替我把幽州的百姓带回来。",
    ],
  },
  {
    npcId: "lord-zhangmiao",
    name: "张邈",
    title: "陈留太守",
    greeting: "关东诸侯会盟，粮道由陈留支应。玄德只管向前，后路有我。",
    lines: [
      "华雄在汜水关前骂阵，联军却没几个人敢应。",
      "关羽若真能斩将，这碗温酒我替他斟满。",
    ],
  },
  {
    npcId: "lord-taoqian",
    name: "陶谦",
    title: "徐州牧",
    greeting: "徐州四战之地。老夫老了，往后要靠你这样的后生。",
    lines: [
      "袁术在寿春称帝，纪灵的三尖刀已经压到小沛了。",
      "百姓要的不过是安生日子。谁能给，徐州就归谁。",
    ],
  },
  {
    npcId: "lord-chende",
    name: "陈登",
    title: "下邳相",
    greeting: "温侯勇而无谋。水一灌，这座城就守不住了。",
    lines: [
      "白门楼上的酒还没凉，城外的水已经漫过马腹。",
      "张辽、高顺都是难得的将才，能不杀就别杀。",
    ],
  },
  {
    npcId: "lord-caocao",
    name: "曹操",
    title: "丞相",
    greeting: "玄德来得正好。袁绍兵多粮足，本相在官渡等他。",
    lines: [
      "颜良文丑当先，河北的旗号遮了半边天。",
      "乌巢的粮草是袁军的命门。一把火，胜过十万兵。",
    ],
  },
  {
    npcId: "lord-liuqi",
    name: "刘琦",
    title: "江夏太守",
    greeting: "曹军饮马长江，江夏的兵不多，可天险在我们这边。",
    lines: [
      "周瑜督水军，黄盖献了诈降火船，只等东南风。",
      "连环船连得越紧，烧起来就越旺。",
    ],
  },
  {
    npcId: "lord-liuzhang",
    name: "刘璋",
    title: "益州牧",
    greeting: "玄德同宗远来，西川的粮草尽可支用。",
    lines: [
      "雒城有张任死守，那是个不肯低头的人。",
      "同宗之谊，莫要走到兵戎相见那一步才好。",
    ],
  },
  {
    npcId: "lord-liushan",
    name: "刘禅",
    title: "后主",
    greeting: "相父北伐去了。朕在成都，等他的捷报。",
    lines: [
      "五丈原的秋风最凉，司马懿隔着渭水一夜没敢合眼。",
      "八处地方都走完了，讨逆的碑上，也该添些太平的字了。",
    ],
  },
];

interface ShopRoom {
  npcId: string;
  wall: string;
  accent: string;
  floor: string;
  prop: "anvil" | "herbs" | "racks" | "stairs" | "abacus" | "gifts" | "dummies" | "armor" | "tables";
}

const SHOP_ROOMS: Record<ShopId, ShopRoom> = {
  forge: { npcId: "blacksmith", wall: "#382e26", accent: "#d98a44", floor: "#43372a", prop: "anvil" },
  herb: { npcId: "herbalist", wall: "#363528", accent: "#9fbf72", floor: "#423c2c", prop: "herbs" },
  supply: { npcId: "quartermaster", wall: "#3d3325", accent: "#d8b46a", floor: "#493d2a", prop: "racks" },
  inn: { npcId: "innkeeper", wall: "#3f322a", accent: "#e0b070", floor: "#4d3d2d", prop: "stairs" },
  bank: { npcId: "banker", wall: "#383126", accent: "#e3c164", floor: "#443a2b", prop: "abacus" },
  coupon: { npcId: "couponkeeper", wall: "#3f2d2d", accent: "#e59aac", floor: "#483531", prop: "gifts" },
  train: { npcId: "trainer", wall: "#393026", accent: "#cf9560", floor: "#483a2b", prop: "dummies" },
  hall: { npcId: "drillmaster", wall: "#333828", accent: "#b9cf8a", floor: "#41422e", prop: "armor" },
  tavern: { npcId: "tavernkeeper", wall: "#402f28", accent: "#e0a05c", floor: "#4b392c", prop: "tables" },
};

interface WalkState {
  x: number;
  y: number;
  facing: FieldFacing;
  moving: boolean;
  walkTo: { x: number; y: number } | null;
  pending: TownTarget | null;
}

type StreetTarget =
  | { kind: "spot"; spot: StreetSpot; label: string; walkX: number; walkY: number }
  | { kind: "walker"; walker: StreetWalker; label: string; walkX: number; walkY: number }
  | { kind: "prop"; prop: StreetProp; label: string; walkX: number; walkY: number };

type RoomTarget =
  | { kind: "counter"; label: string; walkX: number; walkY: number }
  | { kind: "dais"; label: string; walkX: number; walkY: number }
  | { kind: "exit"; label: string; walkX: number; walkY: number };

type TownTarget = StreetTarget | RoomTarget;

interface Speech {
  npcId: string;
  name: string;
  title: string;
  lines: string[];
  index: number;
  facility?: FieldFacilityId;
  palace?: boolean;
}

export interface WalkTownProps {
  chapterIndex: number;
  townName: string;
  tickets: number;
  /** 面板 / 对话浮层打开时停掉走位与按键。 */
  active: boolean;
  partyColor: string;
  partyAccent: string;
  onFacility: (id: FieldFacilityId) => void;
  onLeave: () => void;
  onCouncil: () => void;
  onArmy: () => void;
  className?: string;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const streetCam = (x: number, y: number): { x: number; y: number } => ({
  x: clamp(x - VIEW_W / 2, 0, TOWN_W - VIEW_W),
  y: clamp(y - VIEW_H / 2, 0, TOWN_H - VIEW_H),
});

function walkerX(walker: StreetWalker, time: number): number {
  return walker.baseX + Math.sin(time * walker.speed + walker.phase) * walker.range;
}

function walkerFacing(walker: StreetWalker, time: number): FieldFacing {
  return Math.cos(time * walker.speed + walker.phase) >= 0 ? "right" : "left";
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function paintNameTag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
  ctx.font = townFont(10);
  const width = ctx.measureText(text).width + 12;
  ctx.fillStyle = "rgba(14,11,8,0.72)";
  roundRectPath(ctx, x - width / 2, y - 11, width, 16, 8);
  ctx.fill();
  ctx.fillStyle = "rgba(246,230,196,0.93)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y - 2.5);
  ctx.textBaseline = "alphabetic";
}

function paintLantern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
  phase: number,
): void {
  const sway = Math.sin(time * 1.7 + phase) * 2;
  ctx.strokeStyle = "rgba(28,20,12,0.75)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + sway, y + 13);
  ctx.stroke();
  const lx = x + sway;
  const ly = y + 20;
  const glow = ctx.createRadialGradient(lx, ly, 1, lx, ly, 28);
  glow.addColorStop(0, "rgba(255,196,110,0.38)");
  glow.addColorStop(1, "rgba(255,170,80,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(lx, ly, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#cf5138";
  roundRectPath(ctx, lx - 5, ly - 6, 10, 14, 4);
  ctx.fill();
  ctx.fillStyle = "rgba(255,226,172,0.85)";
  ctx.fillRect(lx - 3.5, ly - 3.5, 7, 9);
  ctx.fillStyle = "#2a2118";
  ctx.fillRect(lx - 2, ly - 8, 4, 2);
  ctx.fillRect(lx - 2, ly + 8, 4, 2);
}

function paintRidge(
  ctx: CanvasRenderingContext2D,
  offset: number,
  baseline: number,
  amplitude: number,
  color: string,
  phase: number,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, baseline + 20);
  for (let x = -40; x <= VIEW_W + 80; x += 40) {
    const y = baseline - Math.abs(Math.sin((x + offset) * 0.006 + phase)) * amplitude;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(VIEW_W, baseline + 30);
  ctx.lineTo(0, baseline + 30);
  ctx.closePath();
  ctx.fill();
}

function paintShopFront(ctx: CanvasRenderingContext2D, spot: StreetSpot, sx: number, time: number): void {
  const w = spot.width;
  const left = sx - w / 2;
  const base = spot.y;

  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.beginPath();
  ctx.ellipse(sx, base + 16, w * 0.56, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#6c5a44";
  ctx.fillRect(left - 6, base - 6, w + 12, 8);

  const wall = ctx.createLinearGradient(0, base - 128, 0, base);
  wall.addColorStop(0, "#e2cfa8");
  wall.addColorStop(1, "#b89a74");
  ctx.fillStyle = wall;
  ctx.fillRect(left, base - 128, w, 122);

  ctx.fillStyle = "#4a3422";
  ctx.fillRect(left, base - 128, 7, 122);
  ctx.fillRect(left + w - 7, base - 128, 7, 122);
  ctx.fillRect(left, base - 128, w, 7);
  ctx.fillRect(left, base - 118, w, 3);

  ctx.fillStyle = "#2a2119";
  ctx.fillRect(left + 14, base - 104, 26, 28);
  ctx.fillRect(left + w - 40, base - 104, 26, 28);
  ctx.strokeStyle = "rgba(214,190,146,0.5)";
  ctx.lineWidth = 1;
  for (const wx of [left + 14, left + w - 40]) {
    ctx.beginPath();
    ctx.moveTo(wx + 13, base - 104);
    ctx.lineTo(wx + 13, base - 76);
    ctx.moveTo(wx, base - 90);
    ctx.lineTo(wx + 26, base - 90);
    ctx.stroke();
  }

  ctx.fillStyle = "#241c13";
  ctx.beginPath();
  ctx.moveTo(sx - 21, base);
  ctx.lineTo(sx - 21, base - 48);
  ctx.quadraticCurveTo(sx, base - 64, sx + 21, base - 48);
  ctx.lineTo(sx + 21, base);
  ctx.closePath();
  ctx.fill();
  const doorGlow = ctx.createLinearGradient(0, base - 58, 0, base);
  doorGlow.addColorStop(0, "rgba(255,204,126,0.05)");
  doorGlow.addColorStop(1, "rgba(255,190,108,0.42)");
  ctx.fillStyle = doorGlow;
  ctx.fillRect(sx - 17, base - 54, 34, 54);

  ctx.fillStyle = spot.accent;
  ctx.fillRect(sx - 25, base - 68, 50, 5);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#efe0bb" : spot.accent;
    ctx.fillRect(sx - 25 + i * 10, base - 80, 10, 12);
  }

  ctx.fillStyle = "#f1e2bd";
  roundRectPath(ctx, sx - 36, base - 102, 72, 20, 3);
  ctx.fill();
  ctx.strokeStyle = spot.accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#3a2a1a";
  ctx.font = townFont(12);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(spot.label, sx, base - 91);
  ctx.textBaseline = "alphabetic";

  paintLantern(ctx, left + 16, base - 122, time, sx * 0.01);
  paintLantern(ctx, left + w - 16, base - 122, time, sx * 0.01 + 1.9);

  ctx.fillStyle = spot.roof;
  ctx.beginPath();
  ctx.moveTo(left - 16, base - 124);
  ctx.lineTo(left + 2, base - 168);
  ctx.lineTo(left + w - 2, base - 168);
  ctx.lineTo(left + w + 16, base - 124);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    ctx.beginPath();
    ctx.moveTo(left - 16 + 18 * t, base - 124);
    ctx.lineTo(left + 2 + (w - 4) * t, base - 168);
    ctx.stroke();
  }
  ctx.fillStyle = "#8a6a44";
  ctx.fillRect(left + 2, base - 172, w - 4, 6);

  const spill = ctx.createRadialGradient(sx, base + 12, 2, sx, base + 12, 52);
  spill.addColorStop(0, "rgba(255,196,112,0.2)");
  spill.addColorStop(1, "rgba(255,180,90,0)");
  ctx.fillStyle = spill;
  ctx.beginPath();
  ctx.ellipse(sx, base + 12, 52, 26, 0, 0, Math.PI * 2);
  ctx.fill();
}

function paintPalaceFront(ctx: CanvasRenderingContext2D, spot: StreetSpot, sx: number, time: number): void {
  const w = spot.width;
  const left = sx - w / 2;
  const base = spot.y;

  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(sx, base + 18, w * 0.6, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#6e6254";
  ctx.fillRect(left - 10, base - 10, w + 20, 12);
  ctx.fillStyle = "#8b7f6b";
  ctx.fillRect(left - 26, base - 4, w + 52, 6);

  const wall = ctx.createLinearGradient(0, base - 132, 0, base);
  wall.addColorStop(0, "#8d3a30");
  wall.addColorStop(1, "#5f2620");
  ctx.fillStyle = wall;
  ctx.fillRect(left, base - 132, w, 122);

  ctx.fillStyle = "#3a1b17";
  for (const cx of [left + 10, left + w / 2 - 26, left + w - 26]) {
    ctx.fillRect(cx, base - 128, 16, 120);
    ctx.fillStyle = "#c99a58";
    ctx.fillRect(cx - 2, base - 132, 20, 5);
    ctx.fillStyle = "#3a1b17";
  }

  ctx.fillStyle = "#241713";
  ctx.beginPath();
  ctx.moveTo(sx - 34, base);
  ctx.lineTo(sx - 34, base - 60);
  ctx.quadraticCurveTo(sx, base - 82, sx + 34, base - 60);
  ctx.lineTo(sx + 34, base);
  ctx.closePath();
  ctx.fill();
  const glow = ctx.createLinearGradient(0, base - 70, 0, base);
  glow.addColorStop(0, "rgba(255,206,130,0.04)");
  glow.addColorStop(1, "rgba(255,190,110,0.34)");
  ctx.fillStyle = glow;
  ctx.fillRect(sx - 30, base - 64, 60, 64);
  ctx.strokeStyle = "rgba(201,154,88,0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sx - 30, base - 4);
  ctx.lineTo(sx - 30, base - 58);
  ctx.moveTo(sx + 30, base - 4);
  ctx.lineTo(sx + 30, base - 58);
  ctx.stroke();

  ctx.fillStyle = "#2d1a13";
  roundRectPath(ctx, sx - 40, base - 108, 80, 24, 3);
  ctx.fill();
  ctx.strokeStyle = "#d8b46a";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#f0d79a";
  ctx.font = townFont(15);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("皇 宫", sx, base - 95);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#5c2a22";
  ctx.beginPath();
  ctx.moveTo(left - 26, base - 128);
  ctx.lineTo(left + 4, base - 184);
  ctx.lineTo(left + w - 4, base - 184);
  ctx.lineTo(left + w + 26, base - 128);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#6d2f26";
  ctx.beginPath();
  ctx.moveTo(left - 18, base - 180);
  ctx.lineTo(left + 16, base - 214);
  ctx.lineTo(left + w - 16, base - 214);
  ctx.lineTo(left + w + 18, base - 180);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    ctx.beginPath();
    ctx.moveTo(left - 26 + 30 * t, base - 128);
    ctx.lineTo(left + 4 + (w - 8) * t, base - 184);
    ctx.stroke();
  }
  ctx.fillStyle = "#c99a58";
  ctx.fillRect(left + 2, base - 190, w - 4, 6);

  for (const fx of [left + 6, left + w - 30]) {
    ctx.strokeStyle = "#2a1c15";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fx, base - 126);
    ctx.lineTo(fx, base - 150);
    ctx.stroke();
    ctx.fillStyle = "#a8352c";
    ctx.beginPath();
    ctx.moveTo(fx, base - 150);
    ctx.lineTo(fx + 20, base - 143 + Math.sin(time * 2 + fx) * 2);
    ctx.lineTo(fx, base - 134);
    ctx.closePath();
    ctx.fill();
  }

  paintLantern(ctx, left + 26, base - 118, time, 0.7);
  paintLantern(ctx, left + w - 26, base - 118, time, 2.4);

  const spill = ctx.createRadialGradient(sx, base + 14, 2, sx, base + 14, 66);
  spill.addColorStop(0, "rgba(255,190,110,0.24)");
  spill.addColorStop(1, "rgba(255,180,90,0)");
  ctx.fillStyle = spill;
  ctx.beginPath();
  ctx.ellipse(sx, base + 14, 66, 30, 0, 0, Math.PI * 2);
  ctx.fill();
}

function paintMonument(ctx: CanvasRenderingContext2D, spot: StreetSpot, sx: number, time: number): void {
  const base = spot.y;
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(sx, base + 12, 44, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#6e665a";
  ctx.fillRect(sx - 38, base - 12, 76, 12);
  ctx.fillStyle = "#8b8375";
  ctx.fillRect(sx - 28, base - 20, 56, 9);

  const stone = ctx.createLinearGradient(sx - 18, 0, sx + 18, 0);
  stone.addColorStop(0, "#b9b2a2");
  stone.addColorStop(0.5, "#d8d2c2");
  stone.addColorStop(1, "#a9a292");
  ctx.fillStyle = stone;
  roundRectPath(ctx, sx - 17, base - 104, 34, 88, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx, base - 104, 17, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = "rgba(60,52,40,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx - 12, base - 96);
  ctx.lineTo(sx - 12, base - 24);
  ctx.moveTo(sx + 12, base - 96);
  ctx.lineTo(sx + 12, base - 24);
  ctx.stroke();

  ctx.fillStyle = "#2c251c";
  ctx.font = townFont(14);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ["桃", "园", "碑"].forEach((char, i) => ctx.fillText(char, sx, base - 84 + i * 21));
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#3b352c";
  ctx.fillRect(sx - 12, base - 30, 24, 10);
  ctx.fillStyle = spot.accent;
  ctx.fillRect(sx - 12, base - 30, 24, 2);
  const ember = ctx.createRadialGradient(sx, base - 34, 1, sx, base - 34, 16);
  ember.addColorStop(0, "rgba(255,170,90,0.5)");
  ember.addColorStop(1, "rgba(255,150,70,0)");
  ctx.fillStyle = ember;
  ctx.beginPath();
  ctx.arc(sx, base - 34, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(60,48,34,0.7)";
  ctx.lineWidth = 1.4;
  for (const dx of [-24, 24]) {
    ctx.beginPath();
    ctx.moveTo(sx + dx, base - 14);
    ctx.lineTo(sx + dx * 1.5, base + 2 + Math.sin(time * 1.5 + dx) * 1.2);
    ctx.stroke();
  }
}

function paintTentFront(ctx: CanvasRenderingContext2D, spot: StreetSpot, sx: number, time: number): void {
  const base = spot.y;
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(sx, base + 14, 74, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#5a4326";
  ctx.lineWidth = 3;
  for (const dx of [-52, 52]) {
    ctx.beginPath();
    ctx.moveTo(sx + dx, base);
    ctx.lineTo(sx + dx * 1.12, base - 96);
    ctx.stroke();
  }

  const canvas = ctx.createLinearGradient(0, base - 120, 0, base);
  canvas.addColorStop(0, "#e0c690");
  canvas.addColorStop(1, "#a98c5c");
  ctx.fillStyle = canvas;
  ctx.beginPath();
  ctx.moveTo(sx - 60, base);
  ctx.lineTo(sx - 32, base - 94);
  ctx.lineTo(sx, base - 122);
  ctx.lineTo(sx + 32, base - 94);
  ctx.lineTo(sx + 60, base);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(90,66,38,0.5)";
  ctx.lineWidth = 1.4;
  for (let i = 1; i < 4; i++) {
    const t = i / 4;
    ctx.beginPath();
    ctx.moveTo(sx - 60 + 120 * t, base);
    ctx.lineTo(sx - 32 + 64 * t, base - 94);
    ctx.stroke();
  }

  ctx.fillStyle = "#2a2016";
  ctx.beginPath();
  ctx.moveTo(sx - 20, base);
  ctx.lineTo(sx, base - 68);
  ctx.lineTo(sx + 20, base);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#c9a668";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx - 20, base);
  ctx.lineTo(sx, base - 68);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx + 20, base);
  ctx.lineTo(sx, base - 68);
  ctx.stroke();

  ctx.strokeStyle = "#4a3422";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, base - 122);
  ctx.lineTo(sx, base - 146);
  ctx.stroke();
  ctx.fillStyle = "#a8352c";
  ctx.beginPath();
  ctx.moveTo(sx, base - 146);
  ctx.lineTo(sx + 20, base - 139 + Math.sin(time * 2.3) * 2);
  ctx.lineTo(sx, base - 130);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#f1e2bd";
  roundRectPath(ctx, sx - 30, base - 100, 60, 18, 3);
  ctx.fill();
  ctx.strokeStyle = spot.accent;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = "#3a2a1a";
  ctx.font = townFont(12);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(spot.label, sx, base - 90);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#6a4a2a";
  ctx.fillRect(sx - 78, base - 26, 18, 24);
  ctx.fillStyle = "#8a6034";
  ctx.fillRect(sx - 76, base - 28, 14, 5);
  ctx.beginPath();
  ctx.arc(sx + 74, base - 12, 13, 0, Math.PI * 2);
  ctx.fillStyle = "#6a4a2a";
  ctx.fill();
  ctx.strokeStyle = "#3f2d1a";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(sx + 62, base - 16);
  ctx.lineTo(sx + 86, base - 16);
  ctx.stroke();
}

function paintGateFront(ctx: CanvasRenderingContext2D, spot: StreetSpot, sx: number, time: number): void {
  const w = spot.width;
  const left = sx - w / 2;
  const base = spot.y;

  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.beginPath();
  ctx.ellipse(sx, base + 16, w * 0.6, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  const wall = ctx.createLinearGradient(0, base - 136, 0, base);
  wall.addColorStop(0, "#736b5c");
  wall.addColorStop(1, "#4a4438");
  ctx.fillStyle = wall;
  ctx.fillRect(left, base - 136, w, 132);
  ctx.fillStyle = "#5b5447";
  for (let x = left; x < left + w; x += 24) {
    ctx.fillRect(x + 3, base - 148, 15, 12);
  }
  ctx.strokeStyle = "rgba(30,26,20,0.35)";
  ctx.lineWidth = 1;
  for (let y = base - 124; y < base; y += 22) {
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + w, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#1f1a14";
  ctx.beginPath();
  ctx.moveTo(sx - 46, base);
  ctx.lineTo(sx - 46, base - 66);
  ctx.quadraticCurveTo(sx, base - 94, sx + 46, base - 66);
  ctx.lineTo(sx + 46, base);
  ctx.closePath();
  ctx.fill();
  const glow = ctx.createLinearGradient(0, base - 80, 0, base + 10);
  glow.addColorStop(0, "rgba(255,214,150,0.08)");
  glow.addColorStop(1, "rgba(255,196,120,0.45)");
  ctx.fillStyle = glow;
  ctx.fillRect(sx - 42, base - 74, 84, 74);

  // 门扇向内敞开，门洞是可穿行的
  for (const dir of [-1, 1] as const) {
    ctx.save();
    ctx.translate(sx + dir * 44, base - 58);
    ctx.rotate(dir * 0.42);
    ctx.fillStyle = "#4a2f1c";
    ctx.fillRect(dir === -1 ? 0 : -30, 0, 30, 58);
    ctx.strokeStyle = "#c99a58";
    ctx.lineWidth = 2;
    ctx.strokeRect(dir === -1 ? 2 : -28, 4, 26, 50);
    ctx.restore();
  }
  for (const dir of [-1, 1] as const) {
    ctx.fillStyle = "#c99a58";
    ctx.beginPath();
    ctx.arc(sx + dir * 58, base - 30, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#3c362e";
  ctx.fillRect(left - 8, base - 174, w + 16, 42);
  ctx.fillStyle = "#5a3a28";
  ctx.beginPath();
  ctx.moveTo(left - 16, base - 168);
  ctx.quadraticCurveTo(sx, base - 214, left + w + 16, base - 168);
  ctx.quadraticCurveTo(sx, base - 150, left - 16, base - 168);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e8d0a0";
  ctx.font = townFont(15);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(spot.label, sx, base - 158);
  ctx.textBaseline = "alphabetic";

  paintLantern(ctx, left + 16, base - 128, time, 1.1);
  paintLantern(ctx, left + w - 16, base - 128, time, 3.3);

  const spill = ctx.createRadialGradient(sx, base + 10, 2, sx, base + 10, 58);
  spill.addColorStop(0, "rgba(255,200,120,0.2)");
  spill.addColorStop(1, "rgba(255,190,100,0)");
  ctx.fillStyle = spill;
  ctx.beginPath();
  ctx.ellipse(sx, base + 10, 58, 28, 0, 0, Math.PI * 2);
  ctx.fill();
}

function paintLampPost(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, phase: number): void {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(x, y + 4, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2f261b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 52);
  ctx.stroke();
  ctx.fillStyle = "#3a2f22";
  ctx.fillRect(x - 8, y - 58, 16, 4);
  paintLantern(ctx, x, y - 56, time, phase);
}

function paintBannerPost(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, phase: number): void {
  ctx.strokeStyle = "#2b241b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 96);
  ctx.stroke();
  const wave = Math.sin(time * 2 + phase) * 4;
  ctx.fillStyle = "#a8352c";
  ctx.beginPath();
  ctx.moveTo(x, y - 96);
  ctx.lineTo(x + 34, y - 88 + wave);
  ctx.lineTo(x, y - 74);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(240,214,160,0.9)";
  ctx.fillRect(x + 6, y - 90, 2, 10);
}

function paintWell(ctx: CanvasRenderingContext2D, x: number, y: number, time: number): void {
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(x, y + 10, 26, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6b6558";
  ctx.beginPath();
  ctx.ellipse(x, y, 23, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a3630";
  ctx.beginPath();
  ctx.ellipse(x, y - 2, 16, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#4a3a28";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 18, y - 4);
  ctx.lineTo(x - 18, y - 38);
  ctx.moveTo(x + 18, y - 4);
  ctx.lineTo(x + 18, y - 38);
  ctx.moveTo(x - 22, y - 38);
  ctx.lineTo(x + 22, y - 38);
  ctx.stroke();
  const sway = Math.sin(time * 1.4) * 1.5;
  ctx.strokeStyle = "rgba(220,208,178,0.8)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - 38);
  ctx.lineTo(x + sway, y - 22);
  ctx.stroke();
  ctx.fillStyle = "#6a4a2a";
  ctx.fillRect(x - 5 + sway, y - 24, 10, 8);
}

function paintNotice(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(x, y + 4, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4a3422";
  ctx.fillRect(x - 2, y - 28, 4, 30);
  ctx.fillStyle = "#8a6a44";
  roundRectPath(ctx, x - 17, y - 56, 34, 26, 3);
  ctx.fill();
  ctx.fillStyle = "#efe0bb";
  ctx.fillRect(x - 13, y - 52, 26, 18);
  ctx.strokeStyle = "rgba(90,70,45,0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 47);
  ctx.lineTo(x + 8, y - 47);
  ctx.moveTo(x - 9, y - 42);
  ctx.lineTo(x + 5, y - 42);
  ctx.moveTo(x - 9, y - 37);
  ctx.lineTo(x + 7, y - 37);
  ctx.stroke();
}

function paintWalkerSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  options: {
    facing: FieldFacing;
    moving: boolean;
    color: string;
    accent: string;
    scale: number;
    hat: boolean;
    staff: boolean;
    basket: boolean;
    time: number;
  },
): void {
  const { facing, moving, color, accent, scale, hat, staff, basket, time } = options;
  const bob = moving ? Math.abs(Math.sin(time * 9)) * 1.6 : Math.sin(time * 2) * 0.6;
  const step = moving ? Math.sin(time * 9) * 2.6 : 0;
  ctx.save();
  ctx.translate(x, y - bob);
  ctx.scale(scale, scale);

  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(0, 5 + bob, 9, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2b2822";
  ctx.fillRect(-5 + step, -7, 4, 8);
  ctx.fillRect(2 - step, -7, 4, 8);

  const robe = ctx.createLinearGradient(0, -26, 0, -4);
  robe.addColorStop(0, color);
  robe.addColorStop(1, "#24241d");
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(-8, -5);
  ctx.lineTo(-7, -21);
  ctx.quadraticCurveTo(0, -27, 7, -21);
  ctx.lineTo(8, -5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-7, -17);
  ctx.lineTo(7, -17);
  ctx.stroke();

  ctx.fillStyle = "#d8b48c";
  ctx.beginPath();
  ctx.arc(0, -30, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2f2a22";
  ctx.beginPath();
  ctx.arc(0, -32, 6.4, Math.PI, 0);
  ctx.fill();
  if (hat) {
    ctx.fillStyle = "#c9a668";
    ctx.beginPath();
    ctx.ellipse(0, -35, 10, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (facing === "down") {
    ctx.fillStyle = "#2a231c";
    ctx.fillRect(-2.5, -30, 1.8, 1.8);
    ctx.fillRect(1.4, -30, 1.8, 1.8);
  } else if (facing === "left" || facing === "right") {
    const dir = facing === "left" ? -1 : 1;
    ctx.fillStyle = "#2a231c";
    ctx.fillRect(dir * 1.8 - 0.9, -30, 1.8, 1.8);
  }

  if (staff) {
    ctx.strokeStyle = "#5a4326";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(8, -2);
    ctx.lineTo(11, -34);
    ctx.stroke();
  }
  if (basket) {
    for (const [dx, dy] of [
      [-8, -14],
      [-10, -19],
      [-6, -19],
    ] as [number, number][]) {
      ctx.fillStyle = "#e8b4b8";
      ctx.beginPath();
      ctx.arc(dx, dy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function paintStreet(
  ctx: CanvasRenderingContext2D,
  time: number,
  cam: { x: number; y: number },
  player: WalkState,
  partyColor: string,
  partyAccent: string,
): void {
  const camX = cam.x;
  const camY = cam.y;
  const horizon = 300 - camY;

  ctx.fillStyle = "#241f19";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const skyBottom = 236 - camY;
  if (skyBottom > 0) {
    const sky = ctx.createLinearGradient(0, -camY, 0, skyBottom);
    sky.addColorStop(0, "#151d32");
    sky.addColorStop(0.55, "#3c3a52");
    sky.addColorStop(1, "#8a6048");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, Math.min(VIEW_H, skyBottom));
  }

  ctx.fillStyle = "rgba(236,240,248,0.65)";
  for (let i = 0; i < 120; i++) {
    const sx = ((i * 149 + 31) % TOWN_W) - camX;
    const sy = ((i * 47) % 118) + 8 - camY;
    if (sx < -2 || sx > VIEW_W + 2 || sy < -2 || sy > skyBottom) continue;
    ctx.fillRect(sx, sy, 1.3, 1.3);
  }

  paintRidge(ctx, camX * 0.12, 172 - camY * 0.45, 30, "#242a3d", 0.5);
  paintRidge(ctx, camX * 0.2, 194 - camY * 0.55, 20, "#1c2132", 1.7);

  const wallTop = 236 - camY;
  ctx.fillStyle = "#2b2924";
  ctx.fillRect(0, wallTop, VIEW_W, 64);
  ctx.fillStyle = "#39362f";
  for (let x = -((camX * 0.3) % 30); x < VIEW_W; x += 30) {
    ctx.fillRect(x, wallTop - 8, 16, 9);
  }

  const ground = ctx.createLinearGradient(0, horizon, 0, VIEW_H);
  ground.addColorStop(0, "#5d5240");
  ground.addColorStop(0.55, "#4a4031");
  ground.addColorStop(1, "#2f2a21");
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, VIEW_W, VIEW_H - horizon);

  ctx.strokeStyle = "rgba(22,18,12,0.26)";
  ctx.lineWidth = 1;
  for (let wy = 340; wy < TOWN_H; wy += 36) {
    const sy = wy - camY;
    if (sy < -2 || sy > VIEW_H + 2) continue;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(VIEW_W, sy);
    ctx.stroke();
  }
  for (let wx = camX - ((camX + 26) % 52); wx < camX + VIEW_W; wx += 52) {
    if (wx < 0 || wx > TOWN_W) continue;
    const sx = wx - camX;
    ctx.beginPath();
    ctx.moveTo(sx, Math.max(0, horizon));
    ctx.lineTo(sx, VIEW_H);
    ctx.stroke();
  }

  const paintRoad = (x: number, y: number, w: number, h: number) => {
    const rx = x - camX;
    const ry = y - camY;
    if (rx > VIEW_W || rx + w < 0 || ry > VIEW_H || ry + h < 0) return;
    const road = ctx.createLinearGradient(0, ry, 0, ry + h);
    road.addColorStop(0, "#6b5d47");
    road.addColorStop(1, "#544736");
    ctx.fillStyle = road;
    ctx.fillRect(rx, ry, w, h);
    ctx.fillStyle = "rgba(30,25,18,0.32)";
    ctx.fillRect(rx, ry, w, 3);
    ctx.fillRect(rx, ry + h - 3, w, 3);
    ctx.strokeStyle = "rgba(232,214,176,0.11)";
    ctx.lineWidth = 1.2;
    for (let wy = y + 24; wy < y + h; wy += 28) {
      const sy = wy - camY;
      if (sy < -2 || sy > VIEW_H + 2) continue;
      ctx.beginPath();
      ctx.moveTo(rx, sy);
      ctx.lineTo(rx + w, sy);
      ctx.stroke();
    }
    for (let wx = x - (x % 56); wx < x + w; wx += 56) {
      const sx = wx - camX;
      if (sx < -2 || sx > VIEW_W + 2) continue;
      ctx.beginPath();
      ctx.moveTo(sx, Math.max(ry, 0));
      ctx.lineTo(sx, Math.min(ry + h, VIEW_H));
      ctx.stroke();
    }
  };
  // 路网：南北两条横街 + 贯穿皇宫与城门的中轴主街 + 东西两条支巷。
  // 主街最宽最亮，横街次之，支巷最暗，靠明度差读出主次而不是铺满一整块地面。
  paintRoad(0, 344, TOWN_W, 356);
  paintRoad(0, 880, TOWN_W, 270);
  paintRoad(40, 336, 120, 814);
  paintRoad(1280, 336, 120, 814);
  paintRoad(670, 336, 140, 814);

  // 广场：中轴与北横街交汇处的一块方砖地，四周压边石
  const plaza = { x: 510, y: 512, w: 460, h: 188 };
  const px = plaza.x - camX;
  const py = plaza.y - camY;
  if (px < VIEW_W && px + plaza.w > 0 && py < VIEW_H && py + plaza.h > 0) {
    const stone = ctx.createLinearGradient(0, py, 0, py + plaza.h);
    stone.addColorStop(0, "#786852");
    stone.addColorStop(1, "#5f513d");
    ctx.fillStyle = stone;
    ctx.fillRect(px, py, plaza.w, plaza.h);
    ctx.strokeStyle = "rgba(28,23,16,0.5)";
    ctx.lineWidth = 5;
    ctx.strokeRect(px + 3, py + 3, plaza.w - 6, plaza.h - 6);
    ctx.strokeStyle = "rgba(232,214,176,0.14)";
    ctx.lineWidth = 1;
    for (let gx = plaza.x + 46; gx < plaza.x + plaza.w; gx += 46) {
      ctx.beginPath();
      ctx.moveTo(gx - camX, Math.max(py, 0));
      ctx.lineTo(gx - camX, Math.min(py + plaza.h, VIEW_H));
      ctx.stroke();
    }
    for (let gy = plaza.y + 46; gy < plaza.y + plaza.h; gy += 46) {
      const sy = gy - camY;
      ctx.beginPath();
      ctx.moveTo(Math.max(px, 0), sy);
      ctx.lineTo(Math.min(px + plaza.w, VIEW_W), sy);
      ctx.stroke();
    }
    // 中心铺一圈方石，暗示这里是全城的汇聚点
    ctx.strokeStyle = "rgba(226,200,148,0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(740 - camX, 606 - camY, 62, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 主街中线：一条浅色石带从皇宫脚下一直铺到城门
  ctx.fillStyle = "rgba(214,192,150,0.14)";
  ctx.fillRect(694 - camX, 344, 92, 806);
  ctx.fillStyle = "rgba(236,214,176,0.2)";
  ctx.fillRect(738 - camX, 344, 4, 806);

  // 北排门脸前的阶沿
  ctx.fillStyle = "#6a5b46";
  ctx.fillRect(0, 326 - camY, VIEW_W, 18);
  ctx.fillStyle = "rgba(24,20,14,0.4)";
  ctx.fillRect(0, 342 - camY, VIEW_W, 3);

  const viewLeft = camX - 160;
  const viewRight = camX + VIEW_W + 160;
  const viewTop = camY - 280;
  const viewBottom = camY + VIEW_H + 80;
  const inView = (x: number, y: number, halfW = 0): boolean =>
    x + halfW > viewLeft && x - halfW < viewRight && y > viewTop && y < viewBottom;

  ctx.save();
  ctx.translate(-camX, -camY);

  const bodies: { y: number; draw: () => void }[] = [];
  for (const spot of STREET_SPOTS) {
    if (!inView(spot.x, spot.y, spot.width / 2)) continue;
    bodies.push({
      y: spot.y,
      draw: () => {
        if (spot.kind === "shop") paintShopFront(ctx, spot, spot.x, time);
        else if (spot.kind === "palace") paintPalaceFront(ctx, spot, spot.x, time);
        else if (spot.kind === "monument") paintMonument(ctx, spot, spot.x, time);
        else if (spot.kind === "tent") paintTentFront(ctx, spot, spot.x, time);
        else paintGateFront(ctx, spot, spot.x, time);
      },
    });
  }

  for (const [lx, ly] of [
    [300, 470],
    [620, 470],
    [860, 470],
    [1180, 470],
    [430, 980],
    [1050, 980],
  ] as [number, number][]) {
    if (!inView(lx, ly)) continue;
    bodies.push({ y: ly, draw: () => paintLampPost(ctx, lx, ly, time, lx * 0.013) });
  }
  for (const [bx, by] of [
    [608, 400],
    [872, 400],
    [632, 1040],
    [848, 1040],
  ] as [number, number][]) {
    if (!inView(bx, by)) continue;
    bodies.push({ y: by, draw: () => paintBannerPost(ctx, bx, by, time, bx * 0.01) });
  }
  for (const prop of STREET_PROPS) {
    if (!inView(prop.x, prop.y, prop.w)) continue;
    bodies.push({
      y: prop.y + prop.h / 2,
      draw: () => {
        if (prop.id === "well") paintWell(ctx, prop.x, prop.y, time);
        else paintNotice(ctx, prop.x, prop.y);
      },
    });
  }
  for (const walker of STREET_WALKERS) {
    const wx = walkerX(walker, time);
    if (!inView(wx, walker.y)) continue;
    bodies.push({
      y: walker.y,
      draw: () => {
        paintWalkerSprite(ctx, wx, walker.y, {
          facing: walkerFacing(walker, time),
          moving: true,
          color: walker.color,
          accent: walker.accent,
          scale: walker.scale,
          hat: walker.hat,
          staff: walker.staff,
          basket: walker.basket,
          time,
        });
        paintNameTag(ctx, wx, walker.y - 44 * walker.scale - 10, walker.name);
      },
    });
  }
  bodies.push({
    y: player.y,
    draw: () => {
      paintHeroSprite(ctx, player.x, player.y, {
        time,
        facing: player.facing,
        moving: player.moving,
        partyColor,
        partyAccent,
      });
    },
  });
  bodies.sort((a, b) => a.y - b.y);
  for (const body of bodies) body.draw();
  ctx.restore();

  const vignette = ctx.createRadialGradient(VIEW_W / 2, 300, 260, VIEW_W / 2, 270, 620);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.46)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function paintRoomProp(
  ctx: CanvasRenderingContext2D,
  kind: ShopRoom["prop"],
  accent: string,
  time: number,
): void {
  if (kind === "anvil") {
    const glow = ctx.createRadialGradient(176, 262, 4, 176, 262, 74);
    glow.addColorStop(0, "rgba(255,150,70,0.5)");
    glow.addColorStop(1, "rgba(255,120,50,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(96, 178, 164, 160);
    ctx.fillStyle = "#3a2f26";
    ctx.fillRect(150, 250, 56, 30);
    ctx.fillStyle = "#5a5248";
    ctx.fillRect(156, 238, 44, 14);
    ctx.fillStyle = "#2c251e";
    ctx.fillRect(162, 280, 32, 20);
    for (let i = 0; i < 4; i++) {
      const t = (time * 0.7 + i * 0.25) % 1;
      ctx.fillStyle = `rgba(255,190,120,${0.28 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(182 + Math.sin(time + i) * 8, 230 - t * 56, 5 + t * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#4a3a26";
    ctx.fillRect(744, 236, 66, 64);
    ctx.fillStyle = accent;
    ctx.fillRect(752, 246, 24, 10);
    ctx.fillRect(782, 262, 18, 8);
  } else if (kind === "herbs") {
    ctx.fillStyle = "#3f3a28";
    ctx.fillRect(78, 172, 128, 118);
    ctx.strokeStyle = "rgba(20,18,12,0.5)";
    ctx.lineWidth = 1.4;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 2; col++) {
        ctx.strokeRect(86 + col * 62, 182 + row * 27, 56, 22);
        ctx.fillStyle = `rgba(160,190,120,${0.16 + ((row + col) % 2) * 0.1})`;
        ctx.fillRect(88 + col * 62, 184 + row * 27, 52, 18);
      }
    }
    for (const [hx, hy] of [
      [766, 196],
      [796, 210],
      [820, 188],
    ] as [number, number][]) {
      ctx.strokeStyle = "#6a5536";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hx, hy - 22);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.fillStyle = "#8fae62";
      ctx.beginPath();
      ctx.ellipse(hx, hy + 6, 8, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === "racks") {
    ctx.strokeStyle = "#3a2c1c";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(96, 290);
    ctx.lineTo(96, 186);
    ctx.lineTo(218, 186);
    ctx.lineTo(218, 290);
    ctx.stroke();
    ctx.strokeStyle = "#b9a05a";
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const x = 110 + i * 36;
      ctx.beginPath();
      ctx.moveTo(x, 190);
      ctx.lineTo(x, 272);
      ctx.stroke();
      ctx.fillStyle = "#8a7448";
      ctx.beginPath();
      ctx.moveTo(x - 6, 272);
      ctx.lineTo(x + 6, 272);
      ctx.lineTo(x, 262);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#4a3a26";
    ctx.fillRect(742, 236, 64, 54);
    ctx.fillStyle = accent;
    ctx.fillRect(750, 244, 48, 6);
    ctx.fillStyle = "#d8c9a4";
    ctx.fillRect(754, 258, 12, 18);
    ctx.fillRect(772, 258, 12, 14);
  } else if (kind === "stairs") {
    ctx.fillStyle = "#3c3026";
    ctx.beginPath();
    ctx.moveTo(704, 300);
    ctx.lineTo(704, 208);
    ctx.lineTo(862, 208);
    ctx.lineTo(862, 300);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#57432f" : "#4a3828";
      ctx.fillRect(708, 216 + i * 16, 150, 13);
    }
    ctx.fillStyle = accent;
    ctx.fillRect(704, 204, 158, 5);
    ctx.fillStyle = "#5a4632";
    ctx.fillRect(100, 262, 96, 38);
    ctx.fillStyle = "#d8c9a4";
    ctx.fillRect(110, 254, 30, 10);
    ctx.fillRect(146, 250, 34, 14);
  } else if (kind === "abacus") {
    ctx.fillStyle = "#4a3a26";
    ctx.fillRect(84, 196, 124, 94);
    ctx.strokeStyle = "#c9a668";
    ctx.lineWidth = 2;
    ctx.strokeRect(90, 202, 112, 82);
    ctx.fillStyle = "#2f261a";
    for (let row = 0; row < 5; row++) {
      ctx.fillRect(96, 214 + row * 14, 100, 3);
    }
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 7; col++) {
        ctx.fillStyle = (row + col) % 3 === 0 ? accent : "#e0c68e";
        ctx.beginPath();
        ctx.arc(100 + col * 15, 212 + row * 14, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = "#3a2f22";
    ctx.fillRect(760, 240, 66, 60);
    ctx.fillStyle = accent;
    ctx.fillRect(772, 230, 42, 12);
    ctx.fillStyle = "#2b241b";
    ctx.fillRect(786, 246, 10, 18);
  } else if (kind === "gifts") {
    for (const [gx, gy, gw, gh, tone] of [
      [96, 244, 46, 46, "#a8352c"],
      [148, 262, 40, 28, "#b98a4a"],
      [104, 286, 34, 14, "#8a5a3a"],
      [774, 250, 44, 40, "#a8352c"],
      [824, 268, 34, 22, "#b98a4a"],
    ] as [number, number, number, number, string][]) {
      ctx.fillStyle = tone;
      ctx.fillRect(gx, gy, gw, gh);
      ctx.fillStyle = accent;
      ctx.fillRect(gx + gw / 2 - 3, gy, 6, gh);
      ctx.fillRect(gx, gy + gh / 2 - 3, gw, 6);
    }
    ctx.fillStyle = "#d8c9a4";
    ctx.fillRect(752, 206, 56, 26);
    ctx.strokeStyle = accent;
    ctx.strokeRect(756, 210, 48, 18);
  } else if (kind === "dummies") {
    for (const [cx, cy] of [
      [140, 296],
      [808, 296],
    ] as [number, number][]) {
      ctx.fillStyle = "#5a4630";
      ctx.fillRect(cx - 4, cy - 62, 8, 62);
      ctx.strokeStyle = "#4a3826";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - 30, cy - 48);
      ctx.lineTo(cx + 30, cy - 48);
      ctx.stroke();
      ctx.fillStyle = "#c9a668";
      ctx.beginPath();
      ctx.arc(cx, cy - 72, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy - 40, 14, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
    }
  } else if (kind === "armor") {
    for (const [cx, cy] of [
      [136, 300],
      [824, 300],
    ] as [number, number][]) {
      ctx.fillStyle = "#3a3025";
      ctx.fillRect(cx - 3, cy - 58, 6, 58);
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy - 16);
      ctx.lineTo(cx + 18, cy - 16);
      ctx.strokeStyle = "#3a3025";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = "#6a6e72";
      ctx.beginPath();
      ctx.moveTo(cx - 16, cy - 62);
      ctx.lineTo(cx + 16, cy - 62);
      ctx.lineTo(cx + 12, cy - 22);
      ctx.lineTo(cx - 12, cy - 22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 12, cy - 48, 24, 4);
      ctx.fillStyle = "#d8c9a4";
      ctx.beginPath();
      ctx.arc(cx, cy - 72, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    for (const [tx, ty] of [
      [120, 268],
      [806, 280],
    ] as [number, number][]) {
      ctx.fillStyle = "#5a4326";
      ctx.beginPath();
      ctx.ellipse(tx, ty - 10, 32, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3f2e1a";
      ctx.fillRect(tx - 4, ty - 10, 8, 24);
      ctx.fillStyle = "#8a5a3a";
      ctx.fillRect(tx - 10, ty - 22, 7, 10);
      ctx.fillRect(tx + 5, ty - 20, 7, 9);
      for (const dx of [-40, 40]) {
        ctx.fillStyle = "#4a3826";
        ctx.beginPath();
        ctx.ellipse(tx + dx, ty - 2, 8, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const flicker = 0.5 + Math.sin(time * 3) * 0.08;
    ctx.fillStyle = `rgba(255,190,110,${flicker})`;
    ctx.beginPath();
    ctx.arc(478, 218, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintShopInterior(
  ctx: CanvasRenderingContext2D,
  time: number,
  shop: ShopId,
  player: WalkState,
  partyColor: string,
  partyAccent: string,
): void {
  const room = SHOP_ROOMS[shop];
  const spot = SPOT_BY_ID.get(shop);
  const npc = SAGA_NPCS[room.npcId];

  ctx.fillStyle = room.wall;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.fillStyle = "rgba(0,0,0,0.18)";
  for (let x = 0; x < VIEW_W; x += 46) {
    ctx.fillRect(x, 0, 2, 300);
  }
  ctx.fillStyle = "#241c14";
  ctx.fillRect(0, 0, VIEW_W, 14);
  ctx.fillRect(0, 156, VIEW_W, 8);

  paintRoomProp(ctx, room.prop, room.accent, time);

  ctx.fillStyle = "rgba(18,13,9,0.82)";
  roundRectPath(ctx, 386, 52, 188, 44, 6);
  ctx.fill();
  ctx.strokeStyle = room.accent;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#f0e3c2";
  ctx.font = townFont(20);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(spot?.label ?? "", 480, 75);
  ctx.textBaseline = "alphabetic";

  paintLantern(ctx, 276, 118, time, 0.5);
  paintLantern(ctx, 684, 118, time, 2.1);

  const floor = ctx.createLinearGradient(0, 300, 0, VIEW_H);
  floor.addColorStop(0, room.floor);
  floor.addColorStop(1, "#211a13");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 300, VIEW_W, VIEW_H - 300);

  ctx.strokeStyle = "rgba(20,15,10,0.35)";
  ctx.lineWidth = 1;
  for (let y = 318; y < VIEW_H; y += 34) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW_W, y);
    ctx.stroke();
    const shift = (y * 1.7) % 60;
    for (let x = shift; x < VIEW_W; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 34);
      ctx.stroke();
    }
  }

  ctx.fillStyle = "#1d1710";
  ctx.fillRect(436, 496, 88, 44);
  const doorGlow = ctx.createLinearGradient(0, 496, 0, VIEW_H);
  doorGlow.addColorStop(0, "rgba(255,206,130,0.34)");
  doorGlow.addColorStop(1, "rgba(255,190,110,0)");
  ctx.fillStyle = doorGlow;
  ctx.fillRect(436, 486, 88, 54);
  ctx.fillStyle = "rgba(224,206,168,0.35)";
  roundRectPath(ctx, 416, 508, 128, 12, 4);
  ctx.fill();

  ctx.fillStyle = "#3f2d1c";
  roundRectPath(ctx, 296, 338, 368, 16, 4);
  ctx.fill();

  if (npc) {
    paintWalkerSprite(ctx, 480, 384, {
      facing: "down",
      moving: false,
      color: "#4a3a2a",
      accent: room.accent,
      scale: 1.12,
      hat: false,
      staff: false,
      basket: false,
      time,
    });
    paintNameTag(ctx, 480, 320, npc.name);
  }

  ctx.fillStyle = "#2c2015";
  roundRectPath(ctx, 288, 356, 384, 58, 5);
  ctx.fill();
  ctx.fillStyle = "#6b4a2c";
  roundRectPath(ctx, 296, 356, 368, 12, 3);
  ctx.fill();
  ctx.fillStyle = room.accent;
  ctx.fillRect(296, 370, 368, 4);
  ctx.strokeStyle = "rgba(20,14,9,0.45)";
  ctx.lineWidth = 1;
  for (let x = 320; x < 660; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 376);
    ctx.lineTo(x, 412);
    ctx.stroke();
  }
  ctx.fillStyle = "#d8c9a4";
  ctx.fillRect(388, 348, 30, 8);
  ctx.fillRect(542, 348, 24, 8);

  paintHeroSprite(ctx, player.x, player.y, {
    time,
    facing: player.facing,
    moving: player.moving,
    partyColor,
    partyAccent,
  });

  const vignette = ctx.createRadialGradient(480, 300, 220, 480, 270, 540);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function paintPalace(
  ctx: CanvasRenderingContext2D,
  time: number,
  lord: PalaceLord,
  player: WalkState,
  partyColor: string,
  partyAccent: string,
): void {
  const wall = ctx.createLinearGradient(0, 0, 0, 330);
  wall.addColorStop(0, "#2d1714");
  wall.addColorStop(1, "#552823");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.fillStyle = "#3a1d18";
  for (let x = 0; x < VIEW_W; x += 64) {
    ctx.fillRect(x, 0, 3, 330);
  }

  for (const x of [118, 288, 672, 842]) {
    const column = ctx.createLinearGradient(x - 16, 0, x + 16, 0);
    column.addColorStop(0, "#6a2a22");
    column.addColorStop(0.5, "#9a3a2e");
    column.addColorStop(1, "#5a241e");
    ctx.fillStyle = column;
    ctx.fillRect(x - 16, 42, 32, 292);
    ctx.fillStyle = "#c99a58";
    ctx.fillRect(x - 20, 36, 40, 8);
    ctx.fillRect(x - 20, 324, 40, 8);
  }

  for (const x of [203, 480, 757]) {
    const drape = ctx.createLinearGradient(0, 60, 0, 210);
    drape.addColorStop(0, "#7a2c24");
    drape.addColorStop(1, "#4a1b16");
    ctx.fillStyle = drape;
    ctx.beginPath();
    ctx.moveTo(x - 44, 58);
    ctx.lineTo(x + 44, 58);
    ctx.lineTo(x + 34, 188);
    ctx.quadraticCurveTo(x, 210, x - 34, 188);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d8b46a";
    ctx.beginPath();
    ctx.arc(x, 148, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7a2c24";
    ctx.beginPath();
    ctx.arc(x, 148, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  const floor = ctx.createLinearGradient(0, 330, 0, VIEW_H);
  floor.addColorStop(0, "#3d332a");
  floor.addColorStop(1, "#221b15");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 330, VIEW_W, VIEW_H - 330);
  ctx.strokeStyle = "rgba(18,14,10,0.4)";
  ctx.lineWidth = 1;
  for (let y = 350; y < VIEW_H; y += 34) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW_W, y);
    ctx.stroke();
  }
  for (let x = 40; x < VIEW_W; x += 88) {
    ctx.beginPath();
    ctx.moveTo(x, 330);
    ctx.lineTo(x - 18, VIEW_H);
    ctx.stroke();
  }

  ctx.fillStyle = "#6a2a24";
  ctx.beginPath();
  ctx.moveTo(440, 330);
  ctx.lineTo(520, 330);
  ctx.lineTo(560, VIEW_H);
  ctx.lineTo(400, VIEW_H);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#c99a58";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#57493c";
  ctx.fillRect(340, 300, 280, 22);
  ctx.fillRect(356, 322, 248, 16);
  ctx.fillRect(372, 338, 216, 10);
  ctx.fillStyle = "#6b5b49";
  ctx.fillRect(358, 302, 244, 6);

  const chair = ctx.createLinearGradient(0, 190, 0, 320);
  chair.addColorStop(0, "#9a7434");
  chair.addColorStop(1, "#5a3f1e");
  ctx.fillStyle = chair;
  ctx.fillRect(432, 206, 96, 104);
  ctx.fillStyle = "#c9a24a";
  ctx.fillRect(424, 198, 112, 16);
  ctx.fillStyle = "#d8b46a";
  ctx.beginPath();
  ctx.arc(480, 226, 12, 0, Math.PI * 2);
  ctx.fill();

  paintWalkerSprite(ctx, 480, 330, {
    facing: "down",
    moving: false,
    color: "#7a2c24",
    accent: "#e8cd8e",
    scale: 1.16,
    hat: true,
    staff: false,
    basket: false,
    time,
  });

  for (const gx of [300, 660]) {
    paintWalkerSprite(ctx, gx, 356, {
      facing: gx < 480 ? "right" : "left",
      moving: false,
      color: "#3c3a34",
      accent: "#a8b0b8",
      scale: 1.04,
      hat: true,
      staff: true,
      basket: false,
      time,
    });
  }

  ctx.fillStyle = "#3a2a1a";
  roundRectPath(ctx, 410, 350, 140, 22, 4);
  ctx.fill();
  ctx.fillStyle = "#6b4a2c";
  ctx.fillRect(416, 350, 128, 7);
  ctx.fillStyle = "#efe0bb";
  ctx.fillRect(436, 358, 26, 8);
  ctx.fillRect(500, 358, 20, 8);

  paintNameTag(ctx, 480, 262, `${lord.name} · ${lord.title}`);

  for (const bx of [96, 864]) {
    ctx.fillStyle = "#3a2f24";
    ctx.fillRect(bx - 16, 400, 32, 24);
    const flame = ctx.createRadialGradient(bx, 388, 2, bx, 388, 28);
    flame.addColorStop(0, "rgba(255,196,110,0.55)");
    flame.addColorStop(1, "rgba(255,150,60,0)");
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.arc(bx, 388, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,205,130,${0.8 + Math.sin(time * 6 + bx) * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(bx, 386 + Math.sin(time * 5 + bx) * 2, 5, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#1d1710";
  ctx.fillRect(436, 496, 88, 44);
  const doorGlow = ctx.createLinearGradient(0, 496, 0, VIEW_H);
  doorGlow.addColorStop(0, "rgba(255,206,130,0.3)");
  doorGlow.addColorStop(1, "rgba(255,190,110,0)");
  ctx.fillStyle = doorGlow;
  ctx.fillRect(436, 486, 88, 54);
  ctx.fillStyle = "rgba(224,206,168,0.32)";
  roundRectPath(ctx, 416, 508, 128, 12, 4);
  ctx.fill();

  paintHeroSprite(ctx, player.x, player.y, {
    time,
    facing: player.facing,
    moving: player.moving,
    partyColor,
    partyAccent,
  });

  const vignette = ctx.createRadialGradient(480, 300, 230, 480, 270, 540);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function spotActionLabel(spot: StreetSpot): string {
  if (spot.kind === "gate") return "出城行军";
  if (spot.kind === "palace") return "进宫面见主公";
  if (spot.kind === "monument") return "查看桃园碑";
  if (spot.kind === "tent") return "走进营帐议事";
  return `进入${spot.label}`;
}

function streetTargetAt(player: WalkState, time: number): StreetTarget | null {
  let best: StreetTarget | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const px = player.x;
  const py = player.y;

  for (const spot of STREET_SPOTS) {
    const dx = Math.abs(px - spot.x);
    if (dx > spot.width / 2 + 22) continue;
    const dy = py - spot.y;
    if (dy < -6 || dy > 86) continue;
    const score = dx + dy * 0.6;
    if (score < bestScore) {
      bestScore = score;
      best = {
        kind: "spot",
        spot,
        label: spotActionLabel(spot),
        walkX: spot.x,
        walkY: clamp(spot.y + 34, WALK_TOP, WALK_BOTTOM),
      };
    }
  }

  for (const walker of STREET_WALKERS) {
    const wx = walkerX(walker, time);
    const dist = Math.hypot(px - wx, py - walker.y);
    if (dist < 44 && dist < bestScore) {
      bestScore = dist;
      best = {
        kind: "walker",
        walker,
        label: `与${walker.name}说话`,
        walkX: wx + (px < wx ? 26 : -26),
        walkY: walker.y,
      };
    }
  }

  for (const prop of STREET_PROPS) {
    const dx = Math.max(Math.abs(px - prop.x) - prop.w / 2, 0);
    const dy = Math.max(Math.abs(py - prop.y) - prop.h / 2, 0);
    const dist = Math.hypot(dx, dy);
    if (dist < 30 && dist < bestScore) {
      bestScore = dist;
      best = {
        kind: "prop",
        prop,
        label: `查看${prop.label}`,
        walkX: prop.x,
        walkY: prop.y + prop.h / 2 + 20,
      };
    }
  }

  return best;
}

/** 点画布时按整座门脸命中，点屋顶也能走到门口。 */
function streetSpotAtPoint(px: number, py: number, x: number, y: number): StreetTarget | null {
  let best: StreetTarget | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const spot of STREET_SPOTS) {
    const dx = Math.abs(x - spot.x);
    const dy = y - spot.y;
    if (dx > spot.width / 2 + 26 || dy < -spot.height - 30 || dy > 86) continue;
    const score = Math.abs(dy) + dx * 0.2;
    if (score < bestScore) {
      bestScore = score;
      const frontY = clamp(spot.y + 34, WALK_TOP, WALK_BOTTOM);
      // 玩家在南排门脸北侧时先绕到侧边，逐轴滑墙能走到门口，不会顶在墙上
      const behind = spot.y >= 600 && py < spot.y - spot.height - 10;
      best = {
        kind: "spot",
        spot,
        label: spotActionLabel(spot),
        walkX: behind
          ? px < spot.x
            ? spot.x - spot.width / 2 - 30
            : spot.x + spot.width / 2 + 30
          : spot.x,
        walkY: frontY,
      };
    }
  }
  return best;
}

/** 南排门脸立在地面上，按整块占地挡住走位；北排门脸在走位区之外。 */
function streetSolidAt(x: number, y: number): boolean {
  for (const spot of STREET_SPOTS) {
    // 城门是门洞，可以穿过去；北排在走位区之外，不用拦
    if (spot.y < 600 || spot.kind === "gate") continue;
    if (Math.abs(x - spot.x) > spot.width / 2 + 6) continue;
    if (y > spot.y - spot.height - 10 && y < spot.y + 10) return true;
  }
  for (const prop of STREET_PROPS) {
    if (Math.abs(x - prop.x) < prop.w / 2 + 8 && Math.abs(y - prop.y) < prop.h / 2 + 7) return true;
  }
  return false;
}

/** 内景里的柜台与御案是一整块障碍，只能绕着走。 */
function roomSolidAt(x: number, y: number, scene: Scene): boolean {
  if (scene.kind === "shop") return x > 282 && x < 678 && y > 332 && y < 418;
  if (scene.kind === "palace") return x > 330 && x < 630 && y > 296 && y < 382;
  return false;
}

function roomTargetAt(scene: Scene, player: WalkState): RoomTarget | null {
  if (scene.kind === "street") return null;
  const exitDist = Math.hypot(player.x - ROOM_EXIT_X, player.y - 516);
  if (exitDist < 38) {
    return { kind: "exit", label: scene.kind === "palace" ? "出宫回街" : "回到街上", walkX: ROOM_EXIT_X, walkY: 508 };
  }
  if (scene.kind === "palace") {
    const dist = Math.hypot(player.x - 480, player.y - 372);
    if (dist < 84) return { kind: "dais", label: "上前奏事", walkX: 480, walkY: 388 };
    return null;
  }
  const dist = Math.hypot(player.x - 480, player.y - 406);
  if (dist < 62) return { kind: "counter", label: "与掌柜交谈", walkX: 480, walkY: 422 };
  return null;
}

export function WalkTown({
  chapterIndex,
  townName,
  tickets,
  active,
  partyColor,
  partyAccent,
  onFacility,
  onLeave,
  onCouncil,
  onArmy,
  className,
}: WalkTownProps) {
  const [scene, setScene] = useState<Scene>({ kind: "street" });
  const [speech, setSpeech] = useState<Speech | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<Scene>({ kind: "street" });
  const speechRef = useRef<Speech | null>(null);
  const activeRef = useRef(active);
  const propsRef = useRef({ chapterIndex, townName, partyColor, partyAccent, onFacility, onLeave, onCouncil, onArmy });
  const playerRef = useRef<WalkState>({
    x: 740,
    y: 1140,
    facing: "up",
    moving: false,
    walkTo: null,
    pending: null,
  });
  const keysRef = useRef({ up: false, down: false, left: false, right: false });
  const targetRef = useRef<TownTarget | null>(null);
  const promptRef = useRef<string | null>(null);
  const timeRef = useRef(0);
  const returnRef = useRef({ x: 740, y: 1140 });

  useEffect(() => {
    propsRef.current = { chapterIndex, townName, partyColor, partyAccent, onFacility, onLeave, onCouncil, onArmy };
  });

  useEffect(() => {
    activeRef.current = active;
    if (!active) keysRef.current = { up: false, down: false, left: false, right: false };
  }, [active]);

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    speechRef.current = speech;
  }, [speech]);

  const goScene = useCallback((next: Scene, spawnX: number, spawnY: number, facing: FieldFacing) => {
    sceneRef.current = next;
    setScene(next);
    const player = playerRef.current;
    player.x = spawnX;
    player.y = spawnY;
    player.facing = facing;
    player.walkTo = null;
    player.pending = null;
    player.moving = false;
    keysRef.current = { up: false, down: false, left: false, right: false };
  }, []);

  const openSpeech = useCallback((next: Speech) => {
    speechRef.current = next;
    setSpeech(next);
    const player = playerRef.current;
    player.walkTo = null;
    player.pending = null;
    player.moving = false;
  }, []);

  const exitScene = useCallback(() => {
    speechRef.current = null;
    setSpeech(null);
    const back = returnRef.current;
    goScene(
      { kind: "street" },
      back.x,
      clamp(back.y + 16, WALK_TOP, WALK_BOTTOM),
      "down",
    );
  }, [goScene]);

  const enterSpot = useCallback(
    (spot: StreetSpot) => {
      if (spot.kind === "gate") {
        propsRef.current.onLeave();
        return;
      }
      if (spot.kind === "monument" || spot.kind === "tent") {
        propsRef.current.onFacility(spot.id as FieldFacilityId);
        return;
      }
      returnRef.current = { x: spot.x, y: clamp(spot.y + 34, WALK_TOP, WALK_BOTTOM) };
      if (spot.kind === "palace") {
        goScene({ kind: "palace" }, 480, 470, "up");
        return;
      }
      if (isShopId(spot.id)) {
        goScene({ kind: "shop", id: spot.id }, 480, 470, "up");
      }
    },
    [goScene],
  );

  const runTarget = useCallback(
    (target: TownTarget) => {
      const current = sceneRef.current;
      if (target.kind === "spot") {
        enterSpot(target.spot);
        return;
      }
      if (target.kind === "walker") {
        openSpeech({
          npcId: target.walker.npcId,
          name: target.walker.name,
          title: target.walker.title,
          lines: target.walker.lines,
          index: 0,
        });
        return;
      }
      if (target.kind === "prop") {
        openSpeech({
          npcId: target.prop.npcId,
          name: target.prop.label,
          title: target.prop.title,
          lines: target.prop.lines,
          index: 0,
        });
        return;
      }
      if (target.kind === "exit") {
        exitScene();
        return;
      }
      if (target.kind === "counter" && current.kind === "shop") {
        const room = SHOP_ROOMS[current.id];
        const npc = SAGA_NPCS[room.npcId];
        if (!npc) return;
        openSpeech({
          npcId: npc.id,
          name: npc.name,
          title: npc.title,
          lines: [npc.greeting, ...npc.lines],
          index: 0,
          facility: current.id,
        });
        return;
      }
      if (target.kind === "dais" && current.kind === "palace") {
        const index = propsRef.current.chapterIndex % PALACE_LORDS.length;
        const lord = PALACE_LORDS[(index + PALACE_LORDS.length) % PALACE_LORDS.length];
        openSpeech({
          npcId: lord.npcId,
          name: lord.name,
          title: lord.title,
          lines: [lord.greeting, ...lord.lines],
          index: 0,
          palace: true,
        });
      }
    },
    [enterSpot, exitScene, openSpeech],
  );

  const runTargetRef = useRef(runTarget);
  useEffect(() => {
    runTargetRef.current = runTarget;
  }, [runTarget]);

  const interactNow = useCallback(() => {
    if (!activeRef.current || speechRef.current) return;
    const target = targetRef.current;
    if (target) runTargetRef.current(target);
  }, []);

  const advanceSpeech = useCallback(() => {
    const prev = speechRef.current;
    if (!prev) return;
    const next = { ...prev, index: prev.index + 1 };
    speechRef.current = next;
    setSpeech(next);
  }, []);

  const closeSpeech = useCallback(() => {
    speechRef.current = null;
    setSpeech(null);
  }, []);

  const openCurrentFacility = useCallback(() => {
    const current = speechRef.current;
    if (!current?.facility) return;
    closeSpeech();
    propsRef.current.onFacility(current.facility);
  }, [closeSpeech]);

  const openPalaceCouncil = useCallback(() => {
    closeSpeech();
    propsRef.current.onCouncil();
  }, [closeSpeech]);

  const openPalaceArmy = useCallback(() => {
    closeSpeech();
    propsRef.current.onArmy();
  }, [closeSpeech]);

  const handleCanvasClick = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      if (!activeRef.current || speechRef.current) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const sx = ((event.clientX - rect.left) / rect.width) * VIEW_W;
      const sy = ((event.clientY - rect.top) / rect.height) * VIEW_H;
      const player = playerRef.current;
      const current = sceneRef.current;
      if (current.kind === "street") {
        const cam = streetCam(player.x, player.y);
        const wx = sx + cam.x;
        const wy = sy + cam.y;
        const tap = streetSpotAtPoint(player.x, player.y, wx, wy);
        if (tap) {
          player.walkTo = { x: tap.walkX, y: tap.walkY };
          player.pending = tap;
          return;
        }
        player.walkTo = {
          x: clamp(wx, WALK_LEFT, WALK_RIGHT),
          y: clamp(wy, WALK_TOP, WALK_BOTTOM),
        };
        player.pending = null;
        return;
      }
      if (current.kind === "palace") {
        if (sy > 466 && Math.abs(sx - ROOM_EXIT_X) < 86) {
          player.walkTo = { x: ROOM_EXIT_X, y: 508 };
          player.pending = { kind: "exit", label: "出宫回街", walkX: ROOM_EXIT_X, walkY: 508 };
          return;
        }
        if (sy < 384 && Math.abs(sx - 480) < 190) {
          player.walkTo = { x: 480, y: 388 };
          player.pending = { kind: "dais", label: "上前奏事", walkX: 480, walkY: 388 };
          return;
        }
        player.walkTo = {
          x: clamp(sx, PALACE_LEFT, PALACE_RIGHT),
          y: clamp(sy, ROOM_WALK_TOP, ROOM_WALK_BOTTOM),
        };
        player.pending = null;
        return;
      }
      if (sy > 466 && Math.abs(sx - ROOM_EXIT_X) < 86) {
        player.walkTo = { x: ROOM_EXIT_X, y: 508 };
        player.pending = { kind: "exit", label: "回到街上", walkX: ROOM_EXIT_X, walkY: 508 };
        return;
      }
      if (sy < 424 && Math.abs(sx - 480) < 210) {
        player.walkTo = { x: 480, y: 422 };
        player.pending = { kind: "counter", label: "与掌柜交谈", walkX: 480, walkY: 422 };
        return;
      }
      player.walkTo = {
        x: clamp(sx, SHOP_LEFT, SHOP_RIGHT),
        y: clamp(sy, SHOP_WALK_TOP, ROOM_WALK_BOTTOM),
      };
      player.pending = null;
    },
    [],
  );

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (!activeRef.current) return;
      const key = event.key.toLowerCase();
      if (key === "escape") {
        if (speechRef.current) {
          closeSpeech();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (sceneRef.current.kind !== "street") {
          exitScene();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        return;
      }
      if (speechRef.current) return;
      const keys = keysRef.current;
      if (key === "arrowup" || key === "w") {
        keys.up = true;
        event.preventDefault();
      } else if (key === "arrowdown" || key === "s") {
        keys.down = true;
        event.preventDefault();
      } else if (key === "arrowleft" || key === "a") {
        keys.left = true;
        event.preventDefault();
      } else if (key === "arrowright" || key === "d") {
        keys.right = true;
        event.preventDefault();
      } else if (key === "e" || key === "enter" || key === " ") {
        event.preventDefault();
        if (!event.repeat) interactNow();
      }
    };
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const keys = keysRef.current;
      if (key === "arrowup" || key === "w") keys.up = false;
      else if (key === "arrowdown" || key === "s") keys.down = false;
      else if (key === "arrowleft" || key === "a") keys.left = false;
      else if (key === "arrowright" || key === "d") keys.right = false;
    };
    const reset = () => {
      keysRef.current = { up: false, down: false, left: false, right: false };
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", reset);
    };
  }, [closeSpeech, exitScene, interactNow]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = VIEW_W * dpr;
    canvas.height = VIEW_H * dpr;
    const start = performance.now();
    let last = start;
    let raf = 0;

    const solidAt = (x: number, y: number, current: Scene): boolean =>
      current.kind === "street" ? streetSolidAt(x, y) : roomSolidAt(x, y, current);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const time = (now - start) / 1000;
      timeRef.current = time;
      const player = playerRef.current;
      const current = sceneRef.current;
      const info = propsRef.current;
      const frozen = !activeRef.current || Boolean(speechRef.current);
      let moved = false;

      if (!frozen) {
        const keys = keysRef.current;
        let vx = 0;
        let vy = 0;
        if (keys.left) vx -= 1;
        if (keys.right) vx += 1;
        if (keys.up) vy -= 1;
        if (keys.down) vy += 1;
        if (vx === 0 && vy === 0 && player.walkTo) {
          if (solidAt(player.walkTo.x, player.walkTo.y, current)) {
            player.walkTo = null;
            player.pending = null;
          } else {
            const dx = player.walkTo.x - player.x;
            const dy = player.walkTo.y - player.y;
            if (Math.hypot(dx, dy) < 6) {
              player.walkTo = null;
              const pending = player.pending;
              player.pending = null;
              if (pending) runTargetRef.current(pending);
            } else {
              vx = dx;
              vy = dy;
            }
          }
        } else if (vx !== 0 || vy !== 0) {
          player.walkTo = null;
          player.pending = null;
        }
        if (vx !== 0 || vy !== 0) {
          const len = Math.hypot(vx, vy) || 1;
          const stepX = (vx / len) * 158 * dt;
          const stepY = (vy / len) * 158 * dt;
          const bounds =
            current.kind === "street"
              ? { left: WALK_LEFT, right: WALK_RIGHT, top: WALK_TOP, bottom: WALK_BOTTOM }
              : current.kind === "palace"
                ? { left: PALACE_LEFT, right: PALACE_RIGHT, top: ROOM_WALK_TOP, bottom: ROOM_WALK_BOTTOM }
                : { left: SHOP_LEFT, right: SHOP_RIGHT, top: SHOP_WALK_TOP, bottom: ROOM_WALK_BOTTOM };
          if (stepX !== 0 && !solidAt(player.x + stepX, player.y, current)) {
            player.x += stepX;
            moved = true;
          }
          if (stepY !== 0 && !solidAt(player.x, player.y + stepY, current)) {
            player.y += stepY;
            moved = true;
          }
          player.x = clamp(player.x, bounds.left, bounds.right);
          player.y = clamp(player.y, bounds.top, bounds.bottom);
          player.facing =
            Math.abs(vx) >= Math.abs(vy) ? (vx > 0 ? "right" : "left") : vy > 0 ? "down" : "up";
        }
      }
      player.moving = moved && !frozen;

      if (
        !frozen &&
        current.kind !== "street" &&
        player.y >= 506 &&
        Math.abs(player.x - ROOM_EXIT_X) < 66
      ) {
        exitScene();
      }

      const target =
        current.kind === "street" ? streetTargetAt(player, time) : roomTargetAt(current, player);
      targetRef.current = target;
      const label = target?.label ?? null;
      if (label !== promptRef.current) {
        promptRef.current = label;
        setPrompt(label);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (current.kind === "street") {
        paintStreet(ctx, time, streetCam(player.x, player.y), player, info.partyColor, info.partyAccent);
      } else if (current.kind === "palace") {
        const index = info.chapterIndex % PALACE_LORDS.length;
        paintPalace(
          ctx,
          time,
          PALACE_LORDS[(index + PALACE_LORDS.length) % PALACE_LORDS.length],
          player,
          info.partyColor,
          info.partyAccent,
        );
      } else {
        paintShopInterior(ctx, time, current.id, player, info.partyColor, info.partyAccent);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [exitScene]);

  const sceneLabel =
    scene.kind === "street"
      ? `${townName} · 街道`
      : scene.kind === "palace"
        ? "皇宫 · 大殿"
        : `${SPOT_BY_ID.get(scene.id)?.label ?? ""} · 前台`;

  const speechLine = speech ? speech.lines[speech.index % speech.lines.length] : "";

  const padKey = (dir: "up" | "down" | "left" | "right", pressed: boolean) => {
    keysRef.current[dir] = pressed;
  };

  return (
    <div className={cn("relative overflow-hidden bg-black", className)}>
      <canvas
        ref={canvasRef}
        width={VIEW_W * 2}
        height={VIEW_H * 2}
        className="block aspect-[16/9] w-full cursor-pointer touch-none"
        onClick={handleCanvasClick}
        aria-label="城中街景：方向键或 WASD 行走，E / 回车交互"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3">
        <span className="rounded-lg border border-amber-900/40 bg-black/60 px-2.5 py-1 text-xs text-amber-100/90 backdrop-blur">
          {sceneLabel}
        </span>
        <span className="rounded-lg border border-amber-900/40 bg-black/60 px-2.5 py-1 text-xs tabular-nums text-amber-100/80 backdrop-blur">
          {tickets} 张活动券
        </span>
      </div>

      {scene.kind !== "street" ? (
        <button
          type="button"
          onClick={exitScene}
          className="absolute right-3 top-12 z-20 rounded-md border border-amber-900/40 bg-black/55 px-2.5 py-1 text-[11px] text-amber-100/85 backdrop-blur transition hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/80"
        >
          回街
        </button>
      ) : null}

      {!speech && prompt ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex justify-center px-3">
          <span className="rounded-full border border-amber-300/30 bg-black/70 px-3 py-1 text-[11px] text-amber-100/90 backdrop-blur">
            <kbd className="mr-1 rounded border border-amber-200/40 px-1 text-[10px]">E</kbd>
            {prompt}
          </span>
        </div>
      ) : null}

      {speech ? (
        <div className="absolute inset-x-2 bottom-2 z-20 sm:inset-x-6">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2.5 rounded-xl border border-amber-700/50 bg-[#1a140c]/96 p-2.5 shadow-2xl backdrop-blur">
            <SagaPortrait
              npcId={speech.npcId}
              width={46}
              height={58}
              className="shrink-0 rounded border border-amber-900/40"
            />
            <div className="min-w-0 flex-1 basis-44">
              <p className="text-sm font-medium text-amber-50">
                {speech.name}
                <span className="ml-1.5 text-[11px] font-normal text-amber-100/60">{speech.title}</span>
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-100/85">{speechLine}</p>
            </div>
            <div className="flex w-full flex-wrap justify-end gap-1.5 sm:w-auto">
              {speech.facility ? (
                <Button size="sm" onClick={openCurrentFacility}>
                  办正事
                </Button>
              ) : null}
              {speech.palace ? (
                <>
                  <Button size="sm" onClick={openPalaceCouncil}>
                    召集众将议事
                  </Button>
                  <Button size="sm" variant="outline" onClick={openPalaceArmy}>
                    查看军情
                  </Button>
                </>
              ) : null}
              {speech.lines.length > 1 ? (
                <Button size="sm" variant="outline" onClick={advanceSpeech}>
                  再聊两句
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={closeSpeech}>
                告辞
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {!speech && active ? (
        <>
          <div className="absolute bottom-3 left-2 z-20 grid grid-cols-3 gap-1 sm:hidden">
            <span />
            <TownPad label="↑" onPress={(pressed) => padKey("up", pressed)} />
            <span />
            <TownPad label="←" onPress={(pressed) => padKey("left", pressed)} />
            <TownPad label="↓" onPress={(pressed) => padKey("down", pressed)} />
            <TownPad label="→" onPress={(pressed) => padKey("right", pressed)} />
          </div>
          <Button
            size="sm"
            className="absolute bottom-3 right-2 z-20 sm:hidden"
            onClick={interactNow}
          >
            交互
          </Button>
        </>
      ) : null}

      <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 rounded-full border border-amber-900/40 bg-black/55 px-3 py-1 text-[11px] text-amber-100/60 backdrop-blur sm:block">
        方向键 / WASD 或点击地面走动 · 走到门口按 E 进店 · 柜台前按 E 与掌柜交谈
      </p>
    </div>
  );
}

function TownPad({
  label,
  onPress,
}: {
  label: string;
  onPress: (pressed: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        onPress(true);
      }}
      onPointerUp={() => onPress(false)}
      onPointerLeave={() => onPress(false)}
      onPointerCancel={() => onPress(false)}
      className="flex h-9 w-9 select-none items-center justify-center rounded-md border border-white/15 bg-black/55 text-sm text-amber-100/85 backdrop-blur active:bg-amber-400/30"
    >
      {label}
    </button>
  );
}
