/**
 * 桌面版《吞食天地2》运行时素材：地形条带与 12 帧单位动画。
 *
 * 图片只在浏览器里按需加载；测试或服务端渲染时函数返回 null，
 * 各绘制函数必须保留原有程序化画面作为兜底。
 */
import { TSTD2_CHAPTER_TERRAIN, type Tstd2TerrainId } from "@/lib/trial/saga/tstd2-story";
import unitFrames from "./tstd2-unit-frames.json";

export interface Tstd2UnitFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

const UNIT_FRAMES = unitFrames as Record<string, Tstd2UnitFrame[]>;

export const TSTD2_UNIT_STRIP_IDS = [
  "21", "22", "23", "24", "25", "26", "27", "28", "29", "2B", "2C", "2E", "30", "31",
  "33", "34", "35", "36", "37", "38", "39", "3A", "3B", "3C", "3D", "3E", "3F", "40",
  "41", "42", "43", "44", "45", "46", "47", "48", "49", "4A", "4B", "4C", "4D", "4E",
  "4F", "50", "52", "53", "54", "55", "56", "57", "58", "59", "5A", "5B", "5C", "5D",
  "5E", "5F", "60", "62", "63", "64", "65", "66", "67", "68", "69", "6A", "6B", "6C",
  "6D", "6E", "6F", "70", "71", "72", "73", "74", "75", "76", "77", "78", "7A", "7B",
  "7C", "7D", "83", "84", "85", "8C", "8D", "大蛇", "海贼（典藏版）", "神秘武将",
] as const;

const TERRAIN_IDS: Tstd2TerrainId[] = [
  "city", "pass", "tomb", "tunnel", "camp", "mountain", "rock", "canyon", "plain",
  "forest", "cave", "cave-peach", "cave-purple", "cave-green", "cave-blue", "cave-red",
  "cave-yellow", "sea", "stone-array", "wasteland",
];

const images = new Map<string, HTMLImageElement>();
let preloaded = false;

function imageFor(src: string): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  const cached = images.get(src);
  if (cached) return cached;
  const image = new window.Image();
  image.decoding = "async";
  image.src = src;
  images.set(src, image);
  return image;
}

function ready(image: HTMLImageElement | null | undefined): boolean {
  return Boolean(image && image.complete && image.naturalWidth > 0);
}

export function terrainSrc(id: Tstd2TerrainId): string {
  return `/trial/tstd2/terrain/${id}.png`;
}

export function unitStripSrc(id: string): string {
  return `/trial/tstd2/units/${encodeURIComponent(id)}.png`;
}

export function getTerrainImage(id: Tstd2TerrainId): HTMLImageElement | null {
  return imageFor(terrainSrc(id));
}

export function getUnitStrip(id: string): HTMLImageElement | null {
  return imageFor(unitStripSrc(id));
}

export function terrainImageReady(id: Tstd2TerrainId): boolean {
  return ready(getTerrainImage(id));
}

/** 章节对应原版地形：平原、荒地、森林、海、峡谷、山、石阵、城。 */
export function terrainForChapter(chapterIndex: number): Tstd2TerrainId {
  const chapter = Math.max(0, Math.min(8, Math.trunc(chapterIndex) + 1));
  return TSTD2_CHAPTER_TERRAIN[chapter] ?? "plain";
}

/** 大地图格型对应原版地形条带；同一种地形用不同横切段，避免整片复制粘贴。 */
export function terrainForFieldTile(
  kind: number,
  flavor: string,
  hash: number,
): { id: Tstd2TerrainId; sourceX: number } {
  let id: Tstd2TerrainId;
  if (kind === 4) id = "sea";
  else if (kind === 5) id = "pass";
  else if (kind === 6) id = "city";
  else if (kind === 1) id = "wasteland";
  else if (kind === 2) id = "forest";
  else if (kind === 3) id = "rock";
  else if (flavor === "river") id = "plain";
  else if (flavor === "forest") id = "forest";
  else if (flavor === "mountain") id = "mountain";
  else id = "plain";
  // 328px 条带里按 24px 切 13 段，同一地形每次取不同段。
  const slots = 13;
  const sourceX = Math.min(304, (Math.abs(hash) % slots) * 24);
  return { id, sourceX };
}

/** 按单位 id 固定映射到一条原版动画；同一个武将每次上场动作一致。 */
export function unitStripFor(unitId: string): string {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < unitId.length; i++) {
    hash = Math.imul(hash ^ unitId.charCodeAt(i), 16777619) >>> 0;
  }
  // 特殊贴图只有单帧，作为 boss / 异形单位的点缀，不参与普通队列。
  const normal = TSTD2_UNIT_STRIP_IDS.slice(0, 91);
  return normal[hash % normal.length] ?? "21";
}

export function unitStripFrame(image: HTMLImageElement): { width: number; count: number } {
  if (image.naturalWidth >= 600) return { width: 56, count: Math.floor(image.naturalWidth / 56) };
  if (image.naturalWidth >= 400) return { width: 46, count: Math.floor(image.naturalWidth / 46) };
  return { width: image.naturalWidth, count: 1 };
}

/** 原版条带不是等宽切帧：按透明像素切出来的包围盒逐帧播放。 */
export function unitFramesFor(id: string): Tstd2UnitFrame[] {
  return UNIT_FRAMES[id] ?? [];
}

/** 预热全部运行时素材；失败不阻断，画面会自动退回程序化绘制。 */
export async function preloadTstd2Assets(): Promise<void> {
  if (typeof window === "undefined" || preloaded) return;
  preloaded = true;
  const sources = [
    ...TERRAIN_IDS.map((id) => terrainSrc(id)),
    ...TSTD2_UNIT_STRIP_IDS.map((id) => unitStripSrc(id)),
  ];
  await Promise.all(
    sources.map(
      (src) =>
        new Promise<void>((resolve) => {
          const image = imageFor(src);
          if (!image || ready(image)) return resolve();
          const done = () => resolve();
          image.addEventListener("load", done, { once: true });
          image.addEventListener("error", done, { once: true });
        }),
    ),
  );
}
