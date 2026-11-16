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
 * 铺子与皇宫走到门口就自动进门；店里走到柜台前与掌柜说话、办正事。
 *
 * 街景与内景都用 Canvas 现画，逻辑坐标固定 960×540（按 DPR 放大位图），
 * 镜头双向跟随走位。交互点、遮挡与柜台位置都在此文件里，服务端不参与。
 */

const TOWN_W = 2400;
const TOWN_H = 1900;
const WALK_LEFT = 60;
const WALK_RIGHT = 2320;
const WALK_TOP = 336;
const WALK_BOTTOM = 1700;
const SHOP_WALK_TOP = 340;
const ROOM_WALK_TOP = 340;
const ROOM_WALK_BOTTOM = 512;
const ROOM_EXIT_X = 480;
const SHOP_LEFT = 104;
const SHOP_RIGHT = 856;
const PALACE_LEFT = 130;
const PALACE_RIGHT = 830;

/** 四个城口的出城判定区（走进就出城，不按回车）：南 / 北 / 西 / 东。 */
const TOWN_EXITS: { x: number; y: number; w: number; h: number }[] = [
  { x: 1180, y: 1688, w: 260, h: 24 },
  { x: 1180, y: 350, w: 300, h: 28 },
  { x: 76, y: 850, w: 32, h: 180 },
  { x: 2304, y: 850, w: 32, h: 180 },
];

const atExit = (x: number, y: number): boolean =>
  TOWN_EXITS.some(
    (zone) =>
      x > zone.x - zone.w / 2 && x < zone.x + zone.w / 2 && y > zone.y - zone.h / 2 && y < zone.y + zone.h / 2,
  );

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
  id: FieldFacilityId | "palace" | "house-a" | "house-b" | "house-c" | "hermit";
  label: string;
  x: number;
  /** 门脸基线（门口所在的世界 y）。 */
  y: number;
  width: number;
  /** 门脸向上占的高度，南排要按它挡住走位。 */
  height: number;
  kind: "shop" | "palace" | "monument" | "tent" | "gate" | "house";
  accent: string;
  roof: string;
  /** 屋顶上的单字方匾（照原版写法：宿 / 武 / 药 / 训 / 记）。 */
  sign?: string;
}

const STREET_SPOTS: StreetSpot[] = [
  // 四排 × 四座：中心线 220 / 860 / 1500 / 2140，屋宽 320，相邻净空正好 320，
  // 一横一竖两条石板路从空当里穿城，四个方向各留一个城口。
  { id: "forge", label: "铁匠铺", x: 220, y: 300, width: 320, height: 180, kind: "shop", accent: "#b5522a", roof: "#c8561f", sign: "武" },
  { id: "herb", label: "药铺", x: 860, y: 300, width: 320, height: 180, kind: "shop", accent: "#5f7a36", roof: "#cf6a2a", sign: "药" },
  { id: "inn", label: "客栈", x: 1500, y: 300, width: 320, height: 180, kind: "shop", accent: "#b06a30", roof: "#ce6d2c", sign: "宿" },
  { id: "coupon", label: "活动券", x: 2140, y: 300, width: 320, height: 180, kind: "shop", accent: "#a05a6a", roof: "#c0684f", sign: "券" },
  { id: "supply", label: "军需帐", x: 220, y: 700, width: 320, height: 180, kind: "shop", accent: "#9a6a30", roof: "#c85f22", sign: "军" },
  { id: "bank", label: "钱庄", x: 860, y: 700, width: 320, height: 180, kind: "shop", accent: "#9a7a34", roof: "#c65f21", sign: "钱" },
  { id: "palace", label: "皇宫", x: 1500, y: 700, width: 320, height: 220, kind: "palace", accent: "#a33327", roof: "#b83a24", sign: "宫" },
  { id: "tavern", label: "酒馆", x: 2140, y: 700, width: 320, height: 180, kind: "shop", accent: "#a35f34", roof: "#c8621f", sign: "酒" },
  { id: "train", label: "训练场", x: 220, y: 1100, width: 320, height: 180, kind: "shop", accent: "#9a5230", roof: "#c85c20", sign: "训" },
  { id: "hall", label: "编成所", x: 860, y: 1100, width: 320, height: 180, kind: "shop", accent: "#5f7440", roof: "#ca6b2b", sign: "编" },
  { id: "house-a", label: "民居", x: 1500, y: 1100, width: 320, height: 170, kind: "house", accent: "#8a6a48", roof: "#c0703a", sign: "宅" },
  { id: "hermit", label: "隐士庐", x: 2140, y: 1100, width: 320, height: 170, kind: "house", accent: "#6f5a3a", roof: "#b0703c", sign: "道" },
  { id: "tent", label: "营帐", x: 220, y: 1500, width: 240, height: 150, kind: "tent", accent: "#9a6a30", roof: "#c07a3a" },
  { id: "house-b", label: "民居", x: 860, y: 1500, width: 320, height: 170, kind: "house", accent: "#8a6a48", roof: "#c0703a", sign: "宅" },
  { id: "record", label: "桃园碑", x: 1500, y: 1500, width: 120, height: 140, kind: "monument", accent: "#8d7434", roof: "#a89a6a", sign: "记" },
  { id: "house-c", label: "民居", x: 2140, y: 1500, width: 320, height: 170, kind: "house", accent: "#8a6a48", roof: "#c0703a", sign: "宅" },
  // 南面院墙中段留出南城口，触发点在墙口前（不可见，只做交互）
  { id: "gate", label: "出城口", x: 1180, y: 1660, width: 200, height: 60, kind: "gate", accent: "#9a6a30", roof: "#a97a44" },
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
    baseX: 1180,
    range: 300,
    y: 860,
    speed: 0.24,
    phase: 0.4,
    scale: 1.5,
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
    baseX: 740,
    range: 150,
    y: 860,
    speed: 0.34,
    phase: 1.9,
    scale: 1.42,
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
    baseX: 1620,
    range: 150,
    y: 860,
    speed: 0.46,
    phase: 4.2,
    scale: 1.2,
    hat: false,
    staff: false,
    basket: false,
    lines: ["我长大也要当将军！", "娘说将军的队伍不抢东西，是真的吗？"],
  },
  // 城口与皇宫门前的甲士：站定不动，只做拦问与对话
  {
    npcId: "guard-south",
    name: "门卒甲",
    title: "城南门卒",
    color: "#4a4f3c",
    accent: "#d9c48a",
    baseX: 1090,
    range: 0,
    y: 1646,
    speed: 0,
    phase: 0,
    scale: 1.5,
    hat: true,
    staff: true,
    basket: false,
    lines: ["出城往南是旷野，将军要多带些伤药。", "城门昼夜不闭，只是外头不太平。"],
  },
  {
    npcId: "guard-south-b",
    name: "门卒乙",
    title: "城南门卒",
    color: "#4a4f3c",
    accent: "#d9c48a",
    baseX: 1270,
    range: 0,
    y: 1646,
    speed: 0,
    phase: 0,
    scale: 1.5,
    hat: true,
    staff: true,
    basket: false,
    lines: ["末将守这一班，将军慢走。", "回来时敲三下门环，我就开。"],
  },
  {
    npcId: "guard-palace",
    name: "禁军甲",
    title: "宫门甲士",
    color: "#5a4030",
    accent: "#e0c070",
    baseX: 1420,
    range: 0,
    y: 720,
    speed: 0,
    phase: 0,
    scale: 1.5,
    hat: true,
    staff: true,
    basket: false,
    lines: ["宫内不得喧哗，将军请报上名号。", "主公正在堂上议事。"],
  },
  {
    npcId: "guard-palace-b",
    name: "禁军乙",
    title: "宫门甲士",
    color: "#5a4030",
    accent: "#e0c070",
    baseX: 1580,
    range: 0,
    y: 720,
    speed: 0,
    phase: 0,
    scale: 1.5,
    hat: true,
    staff: true,
    basket: false,
    lines: ["主公在殿上，将军进前一步便好。", "宫墙外头就是水渠，别踩空。"],
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
    x: 1260,
    y: 880,
    w: 28,
    h: 30,
    lines: ["榜文上写着募兵的名目，墨迹被露水洇开了一角。", "落款是本地县衙，末尾还按着一方朱印。"],
  },
  {
    id: "well",
    label: "水井",
    npcId: "street-well",
    title: "街口水井",
    x: 1030,
    y: 880,
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
  forge: { npcId: "blacksmith", wall: "#8a6a44", accent: "#b5522a", floor: "#a9793f", prop: "anvil" },
  herb: { npcId: "herbalist", wall: "#7f8a52", accent: "#5f7a36", floor: "#9a8b46", prop: "herbs" },
  supply: { npcId: "quartermaster", wall: "#8d7450", accent: "#9a6a30", floor: "#a8834a", prop: "racks" },
  inn: { npcId: "innkeeper", wall: "#8f7050", accent: "#b06a30", floor: "#ad8046", prop: "stairs" },
  bank: { npcId: "banker", wall: "#877552", accent: "#9a7a34", floor: "#a68b4e", prop: "abacus" },
  coupon: { npcId: "couponkeeper", wall: "#94706a", accent: "#a05a6a", floor: "#a3796a", prop: "gifts" },
  train: { npcId: "trainer", wall: "#8a7050", accent: "#9a5230", floor: "#a57b42", prop: "dummies" },
  hall: { npcId: "drillmaster", wall: "#7d8452", accent: "#5f7440", floor: "#9c8d4a", prop: "armor" },
  tavern: { npcId: "tavernkeeper", wall: "#8f6b48", accent: "#a35f34", floor: "#a87c46", prop: "tables" },
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
  /** 队伍成员配色（按编成所顺序），用来在街上排成一列跟走。 */
  partyMembers?: { color: string; accent: string }[];
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
  ctx.font = townFont(11);
  const width = ctx.measureText(text).width + 14;
  ctx.fillStyle = "rgba(10,8,6,0.82)";
  roundRectPath(ctx, x - width / 2, y - 12, width, 17, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(246,230,196,0.5)";
  ctx.lineWidth = 1;
  roundRectPath(ctx, x - width / 2, y - 12, width, 17, 8);
  ctx.stroke();
  ctx.fillStyle = "#f6e6c4";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y - 3);
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

function paintShopFront(ctx: CanvasRenderingContext2D, spot: StreetSpot, sx: number, time: number): void {
  const w = spot.width;
  const left = sx - w / 2;
  const base = spot.y;
  const wallH = 92;
  const wallTop = base - wallH;

  // 影子：原版是一小块硬边暗影，不做柔和渐变
  ctx.fillStyle = "#a86f26";
  ctx.fillRect(left - 2, base - 2, w + 4, 9);

  // 石台阶：灰石 + 黑边
  ctx.fillStyle = "#9fa294";
  ctx.fillRect(left - 6, base - 12, w + 12, 12);
  ctx.fillStyle = "#bcbfb0";
  for (let x = left - 6; x < left + w + 6; x += 26) {
    ctx.fillRect(x + 1, base - 11, 24, 8);
  }
  ctx.fillStyle = "#1c1a15";
  ctx.fillRect(left - 6, base - 12, w + 12, 2);
  ctx.fillRect(left - 6, base - 2, w + 12, 2);

  // 墙身：奶油木壁，外圈一道黑描边，中间立柱深褐
  ctx.fillStyle = "#efdcac";
  ctx.fillRect(left, wallTop, w, wallH);
  ctx.fillStyle = "#f7e9c4";
  ctx.fillRect(left + 2, wallTop + 2, w - 4, 6);
  ctx.fillStyle = "#1c1a15";
  ctx.fillRect(left, wallTop, w, 2);
  ctx.fillRect(left, wallTop, 2, wallH);
  ctx.fillRect(left + w - 2, wallTop, 2, wallH);
  ctx.fillStyle = "#6b4a28";
  ctx.fillRect(left + 6, wallTop + 2, 6, wallH - 2);
  ctx.fillRect(left + w - 12, wallTop + 2, 6, wallH - 2);

  // 两扇窗：黑框 + 木棂十字，做成大开窗（原版铺面窗子占墙面近一半）
  for (const wx of [left + 22, left + w - 48]) {
    ctx.fillStyle = "#1c1a15";
    ctx.fillRect(wx, wallTop + 14, 26, 22);
    ctx.fillStyle = "#f4e6c2";
    ctx.fillRect(wx + 2, wallTop + 16, 22, 18);
    ctx.fillStyle = "#7c5326";
    ctx.fillRect(wx + 12, wallTop + 16, 2, 18);
    ctx.fillRect(wx + 2, wallTop + 24, 22, 2);
    ctx.fillStyle = "#1c1a15";
    ctx.fillRect(wx, wallTop + 35, 26, 2);
  }

  // 门：一整扇双开木门，比窗高出一头，黑框 + 门楣 + 门钉，不做窗棂
  const doorW = 64;
  ctx.fillStyle = "#1c1a15";
  ctx.fillRect(sx - doorW / 2 - 3, base - 68, doorW + 6, 66);
  ctx.fillStyle = "#8a5a2c";
  ctx.fillRect(sx - doorW / 2, base - 65, doorW / 2 - 1, 62);
  ctx.fillRect(sx + 1, base - 65, doorW / 2 - 1, 62);
  // 门扇木纹
  ctx.fillStyle = "#a06a34";
  for (let yy = base - 60; yy < base - 6; yy += 12) {
    ctx.fillRect(sx - doorW / 2 + 2, yy, doorW / 2 - 5, 2);
    ctx.fillRect(sx + 3, yy, doorW / 2 - 5, 2);
  }
  // 门钉：两扇各四枚
  ctx.fillStyle = "#f0d9a0";
  for (const kx of [-12, 8]) {
    for (const ky of [-50, -26]) ctx.fillRect(sx + kx, base + ky, 3, 3);
  }
  // 门缝 + 门槛石
  ctx.fillStyle = "#1c1a15";
  ctx.fillRect(sx, base - 65, 2, 62);
  ctx.fillStyle = "#b0895a";
  ctx.fillRect(sx - doorW / 2 - 5, base - 4, doorW + 10, 5);

  paintLantern(ctx, left + 4, base - wallH - 2, time, sx * 0.01);
  paintLantern(ctx, left + w - 4, base - wallH - 2, time, sx * 0.01 + 1.9);

  // 瓦顶：橘红瓦、横向瓦垄、黑檐口，两角起翘
  const roofTop = wallTop - 44;
  ctx.fillStyle = spot.roof;
  ctx.beginPath();
  ctx.moveTo(left - 16, wallTop + 2);
  ctx.lineTo(left - 10, wallTop - 16);
  ctx.lineTo(left + 8, roofTop);
  ctx.lineTo(left + w - 8, roofTop);
  ctx.lineTo(left + w + 10, wallTop - 16);
  ctx.lineTo(left + w + 16, wallTop + 2);
  ctx.closePath();
  ctx.fill();
  // 瓦垄：一条 1px 深线一行，行间夹一道更亮的橘色，像素瓦片味
  for (let y = roofTop + 6; y < wallTop - 2; y += 7) {
    const t = (y - roofTop) / (wallTop - roofTop);
    const inset = 8 + 12 * t;
    ctx.fillStyle = "#8e3208";
    ctx.fillRect(left - 16 + inset, y, w + 32 - inset * 2, 1);
    ctx.fillStyle = "#e8842f";
    ctx.fillRect(left - 16 + inset, y + 1, w + 32 - inset * 2, 2);
  }
  // 瓦当竖缝：每 10px 一条短竖线，只压下半截，避免糊成一片
  ctx.fillStyle = "rgba(120,42,8,0.8)";
  for (let x = left - 12; x < left + w + 12; x += 10) {
    ctx.fillRect(x, roofTop + 10, 1, wallTop - roofTop - 14);
  }
  // 檐口黑边与屋脊
  ctx.fillStyle = "#1c1a15";
  ctx.fillRect(left - 16, wallTop, w + 32, 3);
  ctx.fillRect(left + w + 14, wallTop - 18, 4, 12);
  ctx.fillRect(left - 18, wallTop - 18, 4, 12);
  ctx.fillStyle = "#5a2f12";
  ctx.fillRect(left + 6, roofTop - 5, w - 12, 6);
  ctx.fillStyle = "#1c1a15";
  ctx.fillRect(left + 6, roofTop - 7, w - 12, 2);

  // 屋顶方匾：白底黑框，一个字（宿 / 武 / 药 / 训 / 道 / 记）；匾的下边与屋檐下边齐平
  if (spot.sign) {
    const sbW = 30;
    const sbTop = wallTop + 3 - sbW;
    ctx.fillStyle = "#1c1a15";
    ctx.fillRect(sx - sbW / 2 - 2, sbTop - 2, sbW + 4, sbW + 4);
    ctx.fillStyle = "#f8eed2";
    ctx.fillRect(sx - sbW / 2, sbTop, sbW, sbW);
    ctx.fillStyle = "#241a10";
    ctx.font = townFont(19);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(spot.sign, sx, sbTop + sbW / 2 + 1);
    ctx.textBaseline = "alphabetic";
  }
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

/** 城内的树：三团像素绿块 + 黑描边 + 褐树干，照原版那种矮墩墩的树画。 */
function paintTree(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  const r = 18 * scale;
  ctx.fillStyle = "#a86f26";
  ctx.fillRect(x - r * 1.1, y - 2, r * 2.2, 6);

  ctx.fillStyle = "#6b4a24";
  ctx.fillRect(x - 3 * scale, y - 12 * scale, 6 * scale, 12 * scale);

  const blobs: [number, number, number][] = [
    [0, -26, 1],
    [-0.75, -16, 0.72],
    [0.75, -16, 0.72],
  ];
  for (const [dx, dy, s] of blobs) {
    ctx.fillStyle = "#266b1f";
    ctx.fillRect(x + dx * r * 1.2 - r * s - 2, y + dy * scale - r * s - 2, r * s * 2 + 4, r * s * 2 + 4);
  }
  for (const [dx, dy, s] of blobs) {
    ctx.fillStyle = "#3f9c2f";
    ctx.fillRect(x + dx * r * 1.2 - r * s, y + dy * scale - r * s, r * s * 2, r * s * 2);
  }
  ctx.fillStyle = "#63bd47";
  ctx.fillRect(x - r * 0.7, y - 26 * scale - r * 0.6, r * 0.9, r * 0.6);
}

/** 城内几处树位：只摆在铺面之间的空当与南排街边，不挡走位。 */
const STREET_TREES: [number, number, number][] = [
  [430, 420, 0.92],
  [650, 420, 0.86],
  [1720, 420, 0.9],
  [1900, 420, 0.84],
  [430, 990, 0.9],
  [1720, 990, 0.86],
  [430, 1230, 0.88],
  [1720, 1230, 0.82],
  [430, 1440, 0.84],
  [560, 1440, 0.78],
  [1720, 1440, 0.86],
  [1840, 1440, 0.8],
];

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

function paintBannerPost(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, phase: number): void {  ctx.strokeStyle = "#2b241b";
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
  partyMembers: { color: string; accent: string }[] = [],
  trailRef: { current: { x: number; y: number; facing: FieldFacing }[] } = { current: [] },
): void {
  const camX = cam.x;
  const camY = cam.y;
  const horizon = 300 - camY;

  // 吞食天地式城内：整屏都是城，不画天。上方一道灰砖城墙，下方大片赭黄土地。
  ctx.fillStyle = "#d2953a";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // 城墙：亮灰砖 + 深灰缝，砖块错缝砌，砖面再压一道高光
  const wallBottom = horizon;
  if (wallBottom > 0) {
    const brickH = 26;
    const brickW = 52;
    ctx.fillStyle = "#aeb0a6";
    ctx.fillRect(0, 0, VIEW_W, Math.min(VIEW_H, wallBottom));
    ctx.fillStyle = "#c2c4b8";
    for (let row = 0; row * brickH < wallBottom + brickH; row++) {
      const y = row * brickH - (camY % brickH);
      const shift = (row % 2) * (brickW / 2);
      for (let col = -1; col * brickW < VIEW_W + brickW; col++) {
        const x = col * brickW + shift - (camX % (brickW * 2));
        if (x > VIEW_W || x + brickW < 0 || y > wallBottom || y + brickH < 0) continue;
        ctx.fillRect(x + 2, y + 2, brickW - 4, brickH - 5);
      }
    }
    ctx.fillStyle = "rgba(72,73,66,0.16)";
    for (let row = 0; row * brickH < wallBottom + brickH; row++) {
      const y = row * brickH - (camY % brickH);
      if (y > wallBottom) continue;
      ctx.fillRect(0, y + brickH - 3, VIEW_W, 3);
      ctx.fillRect(0, y, VIEW_W, 2);
    }
    // 墙顶压檐与墙脚石头，两侧各一段垛口
    ctx.fillStyle = "#8d8f85";
    ctx.fillRect(0, 0, VIEW_W, Math.max(0, 10 - camY));
    ctx.fillStyle = "#6f7168";
    ctx.fillRect(0, Math.max(0, 10 - camY), VIEW_W, 3);
    ctx.fillStyle = "#8f9187";
    ctx.fillRect(0, wallBottom - 12, VIEW_W, 12);
    ctx.fillStyle = "#5d5f57";
    ctx.fillRect(0, wallBottom - 3, VIEW_W, 4);
    // 城墙上的小垛口，隔 120 一格
    for (let x = -((camX * 0.6) % 120); x < VIEW_W + 120; x += 120) {
      ctx.fillStyle = "#9b9d92";
      ctx.fillRect(x + 8, 6 - camY, 46, 16);
      ctx.fillStyle = "#6f7168";
      ctx.fillRect(x, 22 - camY, 62, 4);
    }
    // 北城口：在城墙上开一道门洞，正对南北主街（走位只到墙面，口子当出城方向）
    const gateX = 1080 - camX;
    const gateTop = 232 - camY;
    if (gateX < VIEW_W && gateX + 320 > 0 && gateTop < wallBottom) {
      ctx.fillStyle = "#1c1a15";
      ctx.fillRect(gateX, gateTop, 320, wallBottom - gateTop);
      const tunnel = ctx.createLinearGradient(0, gateTop, 0, wallBottom);
      tunnel.addColorStop(0, "#2b241c");
      tunnel.addColorStop(1, "#4a3a28");
      ctx.fillStyle = tunnel;
      ctx.fillRect(gateX + 8, gateTop + 8, 304, wallBottom - gateTop - 8);
      ctx.fillStyle = "#8d9082";
      ctx.beginPath();
      ctx.moveTo(gateX, gateTop);
      ctx.lineTo(gateX + 160, gateTop - 34);
      ctx.lineTo(gateX + 320, gateTop);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#a5a898";
      ctx.fillRect(gateX - 12, gateTop - 6, 20, wallBottom - gateTop + 6);
      ctx.fillRect(gateX + 312, gateTop - 6, 20, wallBottom - gateTop + 6);
    }
  }

  // 地面：原版城内是草地打底，铺面跟前一圈橙黄沙土，中间一条条灰石路
  const groundTop = Math.max(0, wallBottom);
  if (groundTop < VIEW_H) {
    ctx.fillStyle = "#55b53c";
    ctx.fillRect(0, groundTop, VIEW_W, VIEW_H - groundTop);
    // 草地纹理：亮暗小方块，硬边像素感
    for (let i = 0; i < 520; i++) {
      const wx = (i * 149 + 23) % TOWN_W;
      const wy = 300 + ((i * 91) % 880);
      const sx = wx - camX;
      const sy = wy - camY;
      if (sx < -3 || sx > VIEW_W + 3 || sy < groundTop || sy > VIEW_H) continue;
      ctx.fillStyle = i % 3 === 0 ? "#3d9a2c" : "#79cd5c";
      ctx.fillRect(sx, sy, 3, 2);
    }
    // 铺面跟前的沙土带：一整条，上下压深色边，边缘再撒几块凸起
    const dirtBands: [number, number, number, number][] = [
      [0, 292, TOWN_W, 54],
      [0, 692, TOWN_W, 44],
      [0, 1092, TOWN_W, 44],
      [0, 1492, TOWN_W, 44],
    ];
    for (const [dx, dy, dw, dh] of dirtBands) {
      const sx = dx - camX;
      const sy = dy - camY;
      if (sx + dw < -10 || sx > VIEW_W + 10 || sy + dh < -10 || sy > VIEW_H + 10) continue;
      ctx.fillStyle = "#b57426";
      ctx.fillRect(sx, sy, dw, dh);
      ctx.fillStyle = "#dda03c";
      ctx.fillRect(sx, sy + 2, dw, dh - 4);
      // 边缘凸起，别切成一条死板的直线
      for (let x = 0; x < dw; x += 26) {
        const bump = (x / 26) % 3 === 0 ? 6 : 3;
        ctx.fillStyle = "#dda03c";
        ctx.fillRect(sx + x, sy + dh - 2, 22, bump);
        ctx.fillStyle = "#b57426";
        ctx.fillRect(sx + x, sy + dh + bump - 2, 22, 2);
      }
      ctx.fillStyle = "#c9842e";
      for (let i = 0; i < dw / 12; i++) {
        ctx.fillRect(sx + ((i * 31) % dw), sy + 6 + ((i * 17) % Math.max(8, dh - 12)), 3, 2);
      }
    }
  }

  // 皇宫一圈水渠：蓝水 + 黑描边 + 亮水纹，正南留一道石桥通向宫门
  const paintCanal = (x: number, y: number, w: number, h: number) => {
    const sx = x - camX;
    const sy = y - camY;
    if (sx > VIEW_W || sx + w < 0 || sy > VIEW_H || sy + h < 0) return;
    ctx.fillStyle = "#1c1a15";
    ctx.fillRect(sx, sy, w, h);
    ctx.fillStyle = "#2f6b9a";
    ctx.fillRect(sx + 2, sy + 2, w - 4, h - 4);
    ctx.fillStyle = "#6fa8c8";
    for (let i = 0; i < Math.max(w, h) / 14; i++) {
      const wx = sx + 4 + ((i * 23) % Math.max(8, w - 10));
      const wy = sy + 5 + ((i * 17) % Math.max(8, h - 10));
      ctx.fillRect(wx, wy, Math.min(9, w - 6), 2);
    }
  };
  paintCanal(1310, 420, 26, 280);
  paintCanal(1664, 420, 26, 280);
  paintCanal(1310, 692, 130, 26);
  paintCanal(1560, 692, 130, 26);
  // 石桥：压在正南渠上，桥面带两道石栏
  const bx = 1440 - camX;
  const by = 690 - camY;
  ctx.fillStyle = "#1c1a15";
  ctx.fillRect(bx, by, 120, 30);
  ctx.fillStyle = "#b4b7a8";
  ctx.fillRect(bx + 2, by + 2, 116, 26);
  ctx.fillStyle = "#bcbfb0";
  for (let i = 0; i < 116; i += 26) ctx.fillRect(bx + 4 + i, by + 4, 22, 10);
  ctx.fillStyle = "#8d9082";
  ctx.fillRect(bx + 2, by + 16, 116, 3);

  const paintRoad = (x: number, y: number, w: number, h: number) => {
    const rx = x - camX;
    const ry = y - camY;
    if (rx > VIEW_W || rx + w < 0 || ry > VIEW_H || ry + h < 0) return;
    // 灰石路：小块方石、黑描边、深灰缝，像素味要足
    const TILE_W = 28;
    const TILE_H = 18;
    ctx.fillStyle = "#a9ac9e";
    ctx.fillRect(rx, ry, w, h);
    ctx.fillStyle = "#bcbfb0";
    for (let wy = Math.max(y, 0) - (Math.max(y, 0) % TILE_H); wy < y + h; wy += TILE_H) {
      const sy = wy - camY;
      if (sy > VIEW_H || sy + TILE_H < 0) continue;
      const rowShift = (Math.round((wy - y) / TILE_H) % 2) * (TILE_W / 2);
      for (let wx = x - (x % TILE_W) + rowShift; wx < x + w; wx += TILE_W) {
        const sx = wx - camX;
        if (sx > VIEW_W || sx + TILE_W < 0) continue;
        ctx.fillRect(
          Math.max(sx, rx) + 1,
          sy + 1,
          Math.min(sx + TILE_W, rx + w) - Math.max(sx, rx) - 2,
          TILE_H - 2,
        );
      }
    }
    ctx.fillStyle = "#575a4c";
    for (let wy = y + TILE_H; wy < y + h; wy += TILE_H) {
      const sy = wy - camY;
      if (sy < -2 || sy > VIEW_H + 2) continue;
      ctx.fillRect(rx, sy, w, 2);
    }
    for (let wx = x - (x % TILE_W); wx < x + w; wx += TILE_W) {
      const sx = wx - camX;
      if (sx < -2 || sx > VIEW_W + 2) continue;
      ctx.fillRect(sx, Math.max(ry, 0), 2, Math.min(ry + h, VIEW_H) - Math.max(ry, 0));
    }
    // 路沿：一条黑线把路和沙土分开
    ctx.fillStyle = "#22201a";
    ctx.fillRect(rx, ry, w, 3);
    ctx.fillRect(rx, ry + h - 3, w, 3);
  };
  // 路网：一横一竖两条石板路十字穿过全城，四个方向各自接到城口的缺口上
  paintRoad(1020, 336, 320, 1364);
  paintRoad(0, 760, TOWN_W, 180);

  // 广场：南北主街与东西横街交汇处一块方砖地，压黑边
  const plaza = { x: 1000, y: 740, w: 360, h: 220 };
  const px = plaza.x - camX;
  const py = plaza.y - camY;
  if (px < VIEW_W && px + plaza.w > 0 && py < VIEW_H && py + plaza.h > 0) {
    ctx.fillStyle = "#b4b7a8";
    ctx.fillRect(px, py, plaza.w, plaza.h);
    ctx.fillStyle = "#c4c7b8";
    for (let gy = plaza.y + 18; gy < plaza.y + plaza.h; gy += 18) {
      const sy = gy - camY;
      const shift = (Math.round((gy - plaza.y) / 18) % 2) * 15;
      for (let gx = plaza.x + 30; gx < plaza.x + plaza.w; gx += 30) {
        ctx.fillRect(gx - camX + shift + 1, sy - 16, 28, 15);
      }
    }
    ctx.fillStyle = "#22201a";
    ctx.fillRect(px, py, plaza.w, 3);
    ctx.fillRect(px, py + plaza.h - 3, plaza.w, 3);
    ctx.fillRect(px, py, 3, plaza.h);
    ctx.fillRect(px + plaza.w - 3, py, 3, plaza.h);
  }

  // 主街中线不再铺浅色石带（会在石路上拖出一条白痕），只留一道深缝分左右
  ctx.fillStyle = "#8d9082";
  ctx.fillRect(1178 - camX, 348, 2, 1348);

  // 北排门脸前的阶沿
  ctx.fillStyle = "#b4b7a8";
  ctx.fillRect(0, 326 - camY, VIEW_W, 18);
  ctx.fillStyle = "#22201a";
  ctx.fillRect(0, 326 - camY, VIEW_W, 3);
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
    // 出城口只是个不可见的交互点，画面上由院墙的缺口表示
    if (spot.kind === "gate") continue;
    if (!inView(spot.x, spot.y, spot.width / 2)) continue;
    bodies.push({
      y: spot.y,
      draw: () => {
        if (spot.kind === "shop" || spot.kind === "house") paintShopFront(ctx, spot, spot.x, time);
        else if (spot.kind === "palace") paintPalaceFront(ctx, spot, spot.x, time);
        else if (spot.kind === "monument") paintMonument(ctx, spot, spot.x, time);
        else paintTentFront(ctx, spot, spot.x, time);
      },
    });
  }

  for (const [tx, ty, ts] of STREET_TREES) {
    if (!inView(tx, ty, 60)) continue;
    bodies.push({ y: ty, draw: () => paintTree(ctx, tx, ty, ts) });
  }
  for (const [lx, ly] of [
    [400, 356],
    [1080, 356],
    [1660, 356],
    [2200, 356],
    [400, 790],
    [1080, 790],
    [1660, 790],
    [2200, 790],
    [400, 1560],
    [1080, 1560],
    [1660, 1560],
    [2200, 1560],
  ] as [number, number][]) {
    if (!inView(lx, ly)) continue;
    bodies.push({ y: ly, draw: () => paintLampPost(ctx, lx, ly, time, lx * 0.013) });
  }
  for (const [bx, by] of [
    [1040, 730],
    [1320, 730],
    [1040, 1560],
    [1320, 1560],
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
        paintNameTag(ctx, wx, walker.y - 40 * walker.scale - 9, walker.name);
      },
    });
  }
  bodies.push({
    y: player.y,
    draw: () => {
      // 队伍移动：按队伍人数在身后排成一条队列，队尾的人跟在走过的轨迹上
      const members = partyMembers.length > 0 ? partyMembers : [{ color: partyColor, accent: partyAccent }];
      const trail = trailRef.current;
      const followers = Math.max(0, Math.min(members.length - 1, 5));
      // 站着不动时轨迹很短，剩下的队友按朝向排在身后，别叠成一坨
      const back =
        player.facing === "up"
          ? { x: 0, y: 1 }
          : player.facing === "down"
            ? { x: 0, y: -1 }
            : player.facing === "left"
              ? { x: 1, y: 0 }
              : { x: -1, y: 0 };
      for (let i = followers; i >= 1; i--) {
        // 按「走过的距离」取点，不再按帧号跳着取：队友紧跟在前一个人身后，不会越走越散
        const want = i * 40;
        let acc = 0;
        let sample: { x: number; y: number; facing: FieldFacing } | null = null;
        for (let k = trail.length - 1; k > 0; k -= 1) {
          const now = trail[k];
          const prev = trail[k - 1];
          acc += Math.hypot(now.x - prev.x, now.y - prev.y);
          if (acc >= want) {
            sample = prev;
            break;
          }
        }
        const mem = members[i] ?? members[members.length - 1];
        const base = sample ?? { x: player.x + back.x * i * 30, y: player.y + back.y * i * 30, facing: player.facing };
        // 一人靠左一人靠右，五个人排成两列整齐队列，不会像糖葫芦一样叠成一串
        const side = i % 2 === 1 ? 1 : -1;
        const at = {
          x: base.x + (back.x === 0 ? side * 13 : 0),
          y: base.y + (back.y === 0 ? side * 13 : 0),
          facing: base.facing,
        };
        bodies.push({
          y: at.y,
          draw: () => {
            paintHeroSprite(ctx, at.x, at.y, {
              time,
              facing: at.facing,
              moving: player.moving,
              partyColor: mem.color,
              partyAccent: mem.accent,
              scale: 1.42,
            });
          },
        });
      }
      paintHeroSprite(ctx, player.x, player.y, {
        time,
        facing: player.facing,
        moving: player.moving,
        partyColor,
        partyAccent,
        scale: 1.5,
      });
    },
  });
  bodies.sort((a, b) => a.y - b.y);
  for (const body of bodies) body.draw();
  ctx.restore();

  // 院墙：沿走位区外沿砌一圈灰砖墙，南面中段留出城口（不画城门，只留缺口与门柱）
  const paintYardWall = (x: number, y: number, w: number, h: number, crenel: boolean) => {
    const sx = x - camX;
    const sy = y - camY;
    if (sx > VIEW_W || sx + w < 0 || sy > VIEW_H || sy + h < 0) return;
    ctx.fillStyle = "#22201a";
    ctx.fillRect(sx, sy, w, h);
    ctx.fillStyle = "#b4b7a8";
    ctx.fillRect(sx + 2, sy + 2, w - 4, h - 6);
    // 砖缝：横两行，竖错缝
    ctx.fillStyle = "#8d9082";
    for (let by = sy + 12; by < sy + h - 4; by += 12) {
      ctx.fillRect(sx + 2, by, w - 4, 2);
    }
    for (let by = sy + 2, row = 0; by < sy + h - 6; by += 12, row++) {
      const shift = (row % 2) * 12;
      for (let bx = sx + 2 + shift; bx < sx + w - 4; bx += 24) {
        ctx.fillRect(bx, by, 2, 10);
      }
    }
    if (crenel) {
      ctx.fillStyle = "#c6c9ba";
      for (let bx = sx + 4; bx < sx + w - 8; bx += 22) {
        ctx.fillRect(bx, sy - 8, 12, 8);
        ctx.fillStyle = "#22201a";
        ctx.fillRect(bx + 12, sy - 8, 2, 8);
        ctx.fillStyle = "#c6c9ba";
      }
    }
  };
  // 南墙分左右两段，中段 320 宽留出南城口
  paintYardWall(0, 1700, 1020, 26, true);
  paintYardWall(1340, 1700, 1060, 26, true);
  // 东西两道墙，各在横街（y 760~940）开一个城口
  paintYardWall(20, 336, 26, 424, false);
  paintYardWall(20, 940, 26, 760, false);
  paintYardWall(2354, 336, 26, 424, false);
  paintYardWall(2354, 940, 26, 760, false);
  // 城口两侧的门柱，比墙高出一截
  for (const [px, py, ph] of [
    [1008, 1678, 48],
    [1352, 1678, 48],
    [14, 752, 48],
    [14, 948, 48],
    [2352, 752, 48],
    [2352, 948, 48],
  ] as [number, number, number][]) {
    const sx = px - camX;
    const sy = py - camY;
    ctx.fillStyle = "#22201a";
    ctx.fillRect(sx, sy, 20, ph);
    ctx.fillStyle = "#a5a898";
    ctx.fillRect(sx + 2, sy + 2, 16, ph - 4);
    ctx.fillStyle = "#c6c9ba";
    ctx.fillRect(sx + 2, sy + 2, 16, 6);
  }

  const vignette = ctx.createRadialGradient(VIEW_W / 2, 300, 300, VIEW_W / 2, 270, 660);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(30,22,8,0.22)");
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
  floor.addColorStop(1, "#7a5730");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 300, VIEW_W, VIEW_H - 300);

  ctx.strokeStyle = "rgba(74,48,22,0.4)";
  ctx.lineWidth = 1.4;
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
    paintNameTag(ctx, 480, 316, npc.name);
  }

  // 柜台沿墙拉通整间铺面（左右抵到墙根）：掌柜站在台后，台后区域走不进去
  ctx.fillStyle = "#2c2015";
  roundRectPath(ctx, 28, 392, 904, 74, 4);
  ctx.fill();
  ctx.fillStyle = "#6b4a2c";
  roundRectPath(ctx, 28, 392, 904, 14, 3);
  ctx.fill();
  ctx.fillStyle = room.accent;
  ctx.fillRect(28, 410, 904, 4);
  ctx.fillStyle = "#241a10";
  ctx.fillRect(28, 460, 904, 6);
  ctx.strokeStyle = "rgba(20,14,9,0.45)";
  ctx.lineWidth = 1;
  for (let x = 60; x < 924; x += 58) {
    ctx.beginPath();
    ctx.moveTo(x, 414);
    ctx.lineTo(x, 458);
    ctx.stroke();
  }
  ctx.fillStyle = "#d8c9a4";
  ctx.fillRect(360, 388, 34, 8);
  ctx.fillRect(566, 388, 28, 8);

  paintHeroSprite(ctx, player.x, player.y, {
    time,
    facing: player.facing,
    moving: player.moving,
    partyColor,
    partyAccent,
  });

  const vignette = ctx.createRadialGradient(480, 300, 240, 480, 270, 560);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(40,26,10,0.24)");
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
    // 铺子与皇宫走到门口就自动进门，不再占用 E 键
    if (spot.kind === "shop" || spot.kind === "palace") continue;
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

/** 走到铺子 / 皇宫门口就直接切内景，不必再按 E：只有朝北贴到门脸那一小段才算。 */
function doorSpotAt(player: WalkState): StreetSpot | null {
  if (player.facing !== "up") return null;
  for (const spot of STREET_SPOTS) {
    if (spot.kind !== "shop" && spot.kind !== "palace") continue;
    if (Math.abs(player.x - spot.x) > Math.min(48, spot.width / 2 - 10)) continue;
    const dy = player.y - spot.y;
    if (dy >= 6 && dy <= 46) return spot;
  }
  return null;
}

/** 南排门脸立在地面上，按整块占地挡住走位；北排门脸在走位区之外。 */
function streetSolidAt(x: number, y: number): boolean {
  for (const spot of STREET_SPOTS) {
    // 城门是门洞，可以穿过去；北排在走位区之外，不用拦
    if (spot.y <= SHOP_WALK_TOP || spot.kind === "gate") continue;
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
  if (scene.kind === "shop") return x > 18 && x < 942 && y > 384 && y < 472;
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
  const dist = Math.hypot(player.x - 480, player.y - 486);
  if (dist < 74) return { kind: "counter", label: "与掌柜交谈", walkX: 480, walkY: 484 };
  return null;
}

export function WalkTown({
  chapterIndex,
  townName,
  tickets,
  active,
  partyColor,
  partyAccent,
  partyMembers,
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
  const propsRef = useRef({ chapterIndex, townName, partyColor, partyAccent, partyMembers, onFacility, onLeave, onCouncil, onArmy });
  const playerRef = useRef<WalkState>({
    x: 1180,
    y: 1660,
    facing: "up",
    moving: false,
    walkTo: null,
    pending: null,
  });
  const keysRef = useRef({ up: false, down: false, left: false, right: false });
  const targetRef = useRef<TownTarget | null>(null);
  const promptRef = useRef<string | null>(null);
  const timeRef = useRef(0);
  const returnRef = useRef({ x: 1180, y: 1660 });
  const trailRef = useRef<{ x: number; y: number; facing: FieldFacing }[]>([]);
  const exitedRef = useRef(false);

  useEffect(() => {
    propsRef.current = { chapterIndex, townName, partyColor, partyAccent, partyMembers, onFacility, onLeave, onCouncil, onArmy };
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
      if (sy > 500 && Math.abs(sx - ROOM_EXIT_X) < 86) {
        player.walkTo = { x: ROOM_EXIT_X, y: 512 };
        player.pending = { kind: "exit", label: "回到街上", walkX: ROOM_EXIT_X, walkY: 512 };
        return;
      }
      if (sy < 490 && Math.abs(sx - 480) < 300) {
        player.walkTo = { x: 480, y: 484 };
        player.pending = { kind: "counter", label: "与掌柜交谈", walkX: 480, walkY: 484 };
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
          const stepX = (vx / len) * 235 * dt;
          const stepY = (vy / len) * 235 * dt;
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

      // 四个城口：走进去就出城（南北东西都通，不用按回车）
      if (!frozen && !exitedRef.current && current.kind === "street" && atExit(player.x, player.y)) {
        exitedRef.current = true;
        propsRef.current.onLeave();
      }

      // 城里的门不再等 E：走到门口（朝北贴近门脸）就切进铺子 / 皇宫内景
      if (!frozen && current.kind === "street") {
        const door = doorSpotAt(player);
        if (door) enterSpot(door);
      }

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

      // 队尾轨迹：只在街上记录，进了内景就断掉，出来重新排队
      if (current.kind === "street") {
        const trail = trailRef.current;
        const last = trail[trail.length - 1];
        if (!last || Math.hypot(player.x - last.x, player.y - last.y) > 3) {
          trail.push({ x: player.x, y: player.y, facing: player.facing });
          if (trail.length > 90) trail.shift();
        }
      } else {
        trailRef.current.length = 0;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (current.kind === "street") {
        paintStreet(
          ctx,
          time,
          streetCam(player.x, player.y),
          player,
          info.partyColor,
          info.partyAccent,
          info.partyMembers ?? [],
          trailRef,
        );
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
  }, [enterSpot, exitScene]);

  const sceneLabel =
    scene.kind === "street"
      ? `${townName} · 街道`
      : scene.kind === "palace"
        ? "皇宫 · 大殿"
        : `${SPOT_BY_ID.get(scene.id)?.label ?? ""} · 前台`;

  const speechLine = speech ? speech.lines[speech.index % speech.lines.length] : "";

  return (
    <div className={cn("relative overflow-hidden bg-black", className)}>
      <canvas
        ref={canvasRef}
        width={VIEW_W * 2}
        height={VIEW_H * 2}
        className="block aspect-[16/9] w-full cursor-pointer touch-none"
        onClick={handleCanvasClick}
        aria-label="城中街景：方向键或 WASD 行走，铺子与皇宫走到门口自动进门，回车与街坊交谈"
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
            <kbd className="mr-1 rounded border border-amber-200/40 px-1 text-[10px]">回车</kbd>
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

      <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 rounded-full border border-amber-900/40 bg-black/55 px-3 py-1 text-[11px] text-amber-100/60 backdrop-blur sm:block">
        方向键 / WASD 或点击地面走动 · 走到铺子 / 皇宫门口直接进门 · 柜台前按回车与掌柜交谈
      </p>
    </div>
  );
}
