/**
 * 雷电行动的三个关卡：敌人波次时间轴、Boss 数值与主题。
 *
 * 时间轴按「开局后秒数」写死，方便调难度；`components/raiden/engine.ts`
 * 只负责在对应时间点把描述变成实体。所有坐标都在 480×720 的逻辑画布内。
 */

export type StageTheme = "coast" | "city" | "orbit";
export type EnemyKind = "drone" | "gunship" | "turret" | "tank" | "heli";
export type PowerType = "W" | "B" | "S" | "M";

export interface EnemySpawn {
  at: number;
  kind: EnemyKind;
  x: number;
  /** 精英机：血更厚、分更高，必掉补给。 */
  elite?: boolean;
  drop?: PowerType;
  dir?: 1 | -1;
}

export interface StageBoss {
  hp: number;
  score: number;
  name: string;
  title: string;
}

export interface StageDef {
  no: number;
  name: string;
  subtitle: string;
  theme: StageTheme;
  /** 第几秒 Boss 入场；之前按时间轴出怪。 */
  bossAt: number;
  boss: StageBoss;
  spawns: EnemySpawn[];
  /** 地面单位随卷轴下移的速度（px/s）。 */
  groundSpeed: number;
}

function wave(
  at: number,
  kind: EnemyKind,
  xs: number[],
  opts: Omit<EnemySpawn, "at" | "kind" | "x"> = {},
): EnemySpawn[] {
  return xs.map((x, i) => ({ at: at + i * 0.16, kind, x, ...opts }));
}

const S1_SPAWNS: EnemySpawn[] = [
  ...wave(2.2, "drone", [140, 190, 240, 290, 340]),
  ...wave(6.5, "drone", [80, 130, 180], { dir: 1 }),
  ...wave(6.7, "drone", [400, 350, 300], { dir: -1 }),
  { at: 9.6, kind: "turret", x: 84 },
  { at: 10.2, kind: "turret", x: 396 },
  ...wave(12.6, "drone", [60, 120, 180, 240, 300, 360, 420]),
  { at: 16.6, kind: "gunship", x: 150, elite: true, drop: "W" },
  { at: 17.2, kind: "gunship", x: 330 },
  { at: 21, kind: "heli", x: 100 },
  { at: 21.6, kind: "heli", x: 380 },
  ...wave(24.6, "drone", [240, 180, 300, 120, 360]),
  { at: 28, kind: "tank", x: 90, dir: 1, drop: "M" },
  { at: 28.8, kind: "tank", x: 390, dir: -1 },
  { at: 31.6, kind: "turret", x: 150 },
  { at: 32.2, kind: "turret", x: 330 },
  { at: 35, kind: "gunship", x: 240, elite: true, drop: "B" },
  ...wave(38.6, "drone", [70, 130, 190, 250, 310, 370, 430]),
  { at: 42, kind: "heli", x: 120 },
  { at: 42.5, kind: "heli", x: 360 },
  ...wave(45.6, "drone", [160, 220, 280, 340], { dir: -1 }),
  { at: 48.6, kind: "tank", x: 140, dir: 1 },
  { at: 49.2, kind: "turret", x: 380 },
  { at: 52, kind: "gunship", x: 120, elite: true, drop: "S" },
  { at: 52.7, kind: "gunship", x: 360 },
  ...wave(55.6, "drone", [90, 150, 210, 270, 330, 390]),
  { at: 57, kind: "tank", x: 420, dir: -1, drop: "M" },
  { at: 58, kind: "heli", x: 240 },
  ...wave(61.4, "drone", [70, 130, 190, 250, 310, 370, 430]),
  { at: 64.4, kind: "turret", x: 110 },
  { at: 64.9, kind: "turret", x: 370 },
  { at: 66.4, kind: "gunship", x: 180, elite: true, drop: "W" },
  { at: 67, kind: "gunship", x: 300 },
  ...wave(69.4, "drone", [60, 120, 180, 240, 300, 360, 420], { dir: 1 }),
  { at: 72.4, kind: "tank", x: 80, dir: 1 },
  { at: 73, kind: "heli", x: 200 },
  { at: 73.6, kind: "heli", x: 300 },
  { at: 75.4, kind: "tank", x: 400, dir: -1, drop: "M" },
  { at: 77.6, kind: "turret", x: 150 },
  { at: 78.1, kind: "turret", x: 330 },
  ...wave(80.4, "drone", [90, 150, 210, 270, 330, 390]),
  { at: 82.4, kind: "gunship", x: 140, elite: true, drop: "B" },
  { at: 83, kind: "gunship", x: 340 },
  { at: 85.4, kind: "heli", x: 120 },
  { at: 85.9, kind: "heli", x: 360 },
  ...wave(88, "drone", [60, 140, 220, 300, 380, 440], { dir: -1 }),
];

const S2_SPAWNS: EnemySpawn[] = [
  ...wave(2.2, "drone", [120, 180, 240, 300, 360]),
  { at: 5.2, kind: "tank", x: 60, dir: 1, drop: "M" },
  { at: 6, kind: "tank", x: 420, dir: -1 },
  { at: 8.6, kind: "turret", x: 100 },
  { at: 9.2, kind: "turret", x: 380 },
  { at: 10.4, kind: "heli", x: 140 },
  { at: 11, kind: "heli", x: 340 },
  ...wave(13.2, "drone", [80, 140, 200, 280, 340, 400]),
  { at: 16.4, kind: "gunship", x: 200, elite: true, drop: "W" },
  { at: 17, kind: "gunship", x: 300 },
  { at: 19.4, kind: "tank", x: 160, dir: 1 },
  { at: 20, kind: "tank", x: 320, dir: -1 },
  ...wave(22.4, "drone", [240, 180, 300, 120, 360]),
  { at: 25.4, kind: "turret", x: 70 },
  { at: 26, kind: "turret", x: 410 },
  { at: 27.6, kind: "heli", x: 120 },
  { at: 28.2, kind: "heli", x: 360 },
  { at: 28.8, kind: "heli", x: 240 },
  { at: 31.4, kind: "gunship", x: 100, elite: true, drop: "B" },
  { at: 32, kind: "gunship", x: 380 },
  { at: 34.4, kind: "tank", x: 60, dir: 1, drop: "M" },
  { at: 35, kind: "tank", x: 420, dir: -1 },
  ...wave(37.6, "drone", [60, 120, 180, 240, 300, 360, 420, 480 - 20]),
  { at: 40.6, kind: "turret", x: 180 },
  { at: 41.2, kind: "turret", x: 300 },
  { at: 43.4, kind: "heli", x: 200 },
  { at: 44, kind: "heli", x: 280 },
  { at: 46.4, kind: "gunship", x: 140, elite: true, drop: "W" },
  { at: 47, kind: "gunship", x: 340 },
  { at: 49.4, kind: "tank", x: 100, dir: 1 },
  { at: 50, kind: "tank", x: 380, dir: -1 },
  ...wave(52.6, "drone", [90, 150, 210, 270, 330, 390], { dir: -1 }),
  { at: 55.4, kind: "turret", x: 80 },
  { at: 55.9, kind: "turret", x: 400 },
  { at: 56.4, kind: "turret", x: 240 },
  { at: 58.4, kind: "heli", x: 140 },
  { at: 59, kind: "heli", x: 340 },
  { at: 61.4, kind: "gunship", x: 240, elite: true, drop: "B" },
  ...wave(64, "drone", [120, 180, 240, 300, 360]),
  ...wave(66.4, "drone", [60, 140, 220, 300, 380, 440]),
  { at: 68.6, kind: "turret", x: 100 },
  { at: 69.1, kind: "turret", x: 380 },
  { at: 70.6, kind: "gunship", x: 180, elite: true, drop: "W" },
  { at: 71.2, kind: "gunship", x: 300 },
  ...wave(73.6, "drone", [80, 140, 200, 280, 340, 400], { dir: 1 }),
  { at: 76.6, kind: "tank", x: 70, dir: 1, drop: "M" },
  { at: 77.2, kind: "tank", x: 410, dir: -1 },
  { at: 79.4, kind: "heli", x: 140 },
  { at: 79.9, kind: "heli", x: 340 },
  ...wave(82.4, "drone", [60, 120, 180, 240, 300, 360, 420]),
  { at: 84.6, kind: "turret", x: 160 },
  { at: 85.1, kind: "turret", x: 320 },
  { at: 87.4, kind: "gunship", x: 120, elite: true, drop: "S" },
  { at: 88, kind: "gunship", x: 360 },
  { at: 90.4, kind: "tank", x: 100, dir: 1 },
  { at: 91, kind: "tank", x: 380, dir: -1 },
  ...wave(93.4, "drone", [90, 150, 210, 270, 330, 390]),
  { at: 95.6, kind: "heli", x: 200 },
  { at: 96.1, kind: "heli", x: 280 },
  ...wave(98.4, "drone", [60, 140, 220, 300, 380, 440], { dir: -1 }),
  { at: 100.4, kind: "gunship", x: 240, elite: true, drop: "B" },
];

const S3_SPAWNS: EnemySpawn[] = [
  ...wave(2, "drone", [90, 160, 230, 300, 370, 430]),
  { at: 5, kind: "gunship", x: 140 },
  { at: 5.6, kind: "gunship", x: 340 },
  { at: 8, kind: "turret", x: 90 },
  { at: 8.6, kind: "turret", x: 390 },
  { at: 11, kind: "heli", x: 160 },
  { at: 11.5, kind: "heli", x: 320 },
  { at: 13.6, kind: "tank", x: 80, dir: 1 },
  { at: 14.2, kind: "tank", x: 400, dir: -1 },
  ...wave(16.4, "drone", [60, 110, 160, 210, 270, 320, 370, 420], { dir: 1 }),
  { at: 19.4, kind: "gunship", x: 240, elite: true, drop: "W" },
  { at: 22, kind: "tank", x: 160, dir: 1 },
  { at: 22.6, kind: "tank", x: 320, dir: -1 },
  { at: 25, kind: "turret", x: 60 },
  { at: 25.5, kind: "turret", x: 420 },
  { at: 26, kind: "turret", x: 240 },
  ...wave(28.4, "drone", [120, 180, 240, 300, 360]),
  { at: 31.4, kind: "heli", x: 100 },
  { at: 31.9, kind: "heli", x: 380 },
  { at: 32.4, kind: "heli", x: 240 },
  { at: 34.4, kind: "gunship", x: 140, elite: true, drop: "B" },
  { at: 35, kind: "gunship", x: 340 },
  { at: 37.4, kind: "tank", x: 70, dir: 1, drop: "M" },
  { at: 38, kind: "tank", x: 410, dir: -1 },
  ...wave(40.4, "drone", [240, 170, 310, 100, 380, 60, 420]),
  { at: 43.4, kind: "turret", x: 120 },
  { at: 43.9, kind: "turret", x: 360 },
  { at: 46.4, kind: "heli", x: 200 },
  { at: 46.9, kind: "heli", x: 280 },
  { at: 49.4, kind: "gunship", x: 240, elite: true, drop: "S" },
  { at: 52, kind: "tank", x: 100, dir: 1 },
  { at: 52.5, kind: "tank", x: 380, dir: -1 },
  ...wave(55, "drone", [60, 120, 180, 240, 300, 360, 420], { dir: -1 }),
  { at: 58, kind: "turret", x: 80 },
  { at: 58.4, kind: "turret", x: 400 },
  { at: 58.8, kind: "turret", x: 240 },
  { at: 61.4, kind: "heli", x: 140 },
  { at: 61.9, kind: "heli", x: 340 },
  { at: 64.4, kind: "gunship", x: 120, elite: true, drop: "W" },
  { at: 64.9, kind: "gunship", x: 360, elite: true, drop: "B" },
  ...wave(67.4, "drone", [100, 170, 240, 310, 380]),
  ...wave(69.6, "drone", [60, 140, 220, 300, 380, 440]),
  { at: 71.6, kind: "turret", x: 110 },
  { at: 72.1, kind: "turret", x: 370 },
  { at: 73.6, kind: "gunship", x: 160, elite: true, drop: "W" },
  { at: 74.2, kind: "gunship", x: 320 },
  ...wave(76.6, "drone", [70, 130, 190, 250, 310, 370, 430], { dir: 1 }),
  { at: 79.6, kind: "tank", x: 90, dir: 1 },
  { at: 80.2, kind: "tank", x: 390, dir: -1 },
  { at: 82.4, kind: "heli", x: 120 },
  { at: 82.9, kind: "heli", x: 240 },
  { at: 83.4, kind: "heli", x: 360 },
  ...wave(85.6, "drone", [60, 130, 200, 270, 340, 420]),
  { at: 87.6, kind: "turret", x: 140 },
  { at: 88.1, kind: "turret", x: 340 },
  { at: 90.4, kind: "gunship", x: 100, elite: true, drop: "M" },
  { at: 91, kind: "gunship", x: 380 },
  { at: 93.4, kind: "tank", x: 70, dir: 1 },
  { at: 94, kind: "tank", x: 410, dir: -1 },
  ...wave(96.4, "drone", [90, 160, 230, 300, 370, 440], { dir: -1 }),
  { at: 98.6, kind: "heli", x: 140 },
  { at: 99.1, kind: "heli", x: 340 },
  { at: 101.4, kind: "turret", x: 60 },
  { at: 101.9, kind: "turret", x: 420 },
  { at: 102.4, kind: "turret", x: 240 },
  { at: 104.6, kind: "gunship", x: 200, elite: true, drop: "W" },
  { at: 105.2, kind: "gunship", x: 300, elite: true, drop: "B" },
  ...wave(108, "drone", [60, 140, 220, 300, 380, 440]),
  ...wave(110.4, "drone", [100, 170, 240, 310, 380], { dir: -1 }),
];

export const STAGE_DEFS: StageDef[] = [
  {
    no: 1,
    name: "滨海防线",
    subtitle: "COASTAL DEFENSE",
    theme: "coast",
    bossAt: 92,
    groundSpeed: 72,
    boss: { hp: 3200, score: 18000, name: "苍鹭级空母", title: "HERON CLASS CARRIER" },
    spawns: S1_SPAWNS,
  },
  {
    no: 2,
    name: "钢铁城区",
    subtitle: "STEEL DISTRICT",
    theme: "city",
    bossAt: 104,
    groundSpeed: 88,
    boss: { hp: 4800, score: 26000, name: "攻城要塞「铁蜈蚣」", title: "IRON CENTIPEDE" },
    spawns: S2_SPAWNS,
  },
  {
    no: 3,
    name: "轨道要塞",
    subtitle: "ORBITAL FORTRESS",
    theme: "orbit",
    bossAt: 116,
    groundSpeed: 104,
    boss: { hp: 6600, score: 38000, name: "雷神核心", title: "THUNDER CORE" },
    spawns: S3_SPAWNS,
  },
];

export function stageDef(no: number): StageDef {
  return STAGE_DEFS.find((s) => s.no === no) ?? STAGE_DEFS[0];
}
