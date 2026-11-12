/**
 * 试炼回廊的像素渲染层（480×270 逻辑画布，CSS 整数感放大）。
 *
 * 只负责画：视差浮空城、每层配色、门、角色与怪物像素画、伤害数字与火花。
 * 所有玩法结果都来自 `lib/trial/dungeon.ts` 的确定性状态，这里不改变任何账目。
 */

import {
  TRIAL_BOSS_DOOR_X,
  TRIAL_DOOR_X,
  TRIAL_ENEMY_SPAWN_X,
  TRIAL_GROUND_Y,
  TRIAL_HERO_START_X,
  TRIAL_INTERACT_RADIUS,
  TRIAL_VIEW_H,
  TRIAL_VIEW_W,
  TRIAL_WORLD_W,
  type TrialEvent,
  type TrialGameState,
  type TrialIntent,
  type TrialRoomKind,
  type TrialWaveShape,
} from "@/lib/trial/dungeon";

export interface TrialTheme {
  sky: [string, string];
  horizon: string;
  accent: string;
  accentSoft: string;
  ground: string;
  edge: string;
  star: string;
  tower: string;
  island: string;
}

/** 每层一套配色：层数越深，色调越冷、越危险。 */
export const TRIAL_THEMES: TrialTheme[] = [
  { sky: ["#0d1738", "#2a1c55"], horizon: "#6d4bb5", accent: "#67e8f9", accentSoft: "#164e63", ground: "#0a1024", edge: "#38bdf8", star: "#dbeafe", tower: "#1b2450", island: "#232f63" },
  { sky: ["#081f33", "#0f3b4a"], horizon: "#0e7490", accent: "#5eead4", accentSoft: "#134e4a", ground: "#071723", edge: "#2dd4bf", star: "#ccfbf1", tower: "#123243", island: "#17424f" },
  { sky: ["#1c1235", "#3b1d5e"], horizon: "#a855f7", accent: "#e879f9", accentSoft: "#4a1d63", ground: "#120a26", edge: "#c084fc", star: "#f5d0fe", tower: "#2a1a4d", island: "#392465" },
  { sky: ["#2a1220", "#5b1a2e"], horizon: "#be123c", accent: "#fda4af", accentSoft: "#5f1428", ground: "#170911", edge: "#fb7185", star: "#ffe4e6", tower: "#3c1424", island: "#571a2e" },
  { sky: ["#0b2230", "#173f3a"], horizon: "#0d9488", accent: "#fbbf24", accentSoft: "#4d3a0a", ground: "#08161b", edge: "#f59e0b", star: "#fef3c7", tower: "#14302e", island: "#1b463f" },
  { sky: ["#101a3a", "#26206b"], horizon: "#4338ca", accent: "#a5b4fc", accentSoft: "#312e81", ground: "#0a0f24", edge: "#818cf8", star: "#e0e7ff", tower: "#1c2254", island: "#2a2f6e" },
  { sky: ["#241a08", "#4a2c0c"], horizon: "#b45309", accent: "#fcd34d", accentSoft: "#5c3a08", ground: "#160f04", edge: "#fbbf24", star: "#fef9c3", tower: "#3a2a10", island: "#513911" },
];

const ROOM_TONE: Record<TrialRoomKind, { frame: string; glow: string; label: string }> = {
  fight: { frame: "#475569", glow: "#94a3b8", label: "野区" },
  elite: { frame: "#7c3aed", glow: "#c4b5fd", label: "精英" },
  treasure: { frame: "#b45309", glow: "#fcd34d", label: "宝箱" },
  rest: { frame: "#047857", glow: "#6ee7b7", label: "营地" },
};

const BOSS_TONE = { frame: "#9f1239", glow: "#fda4af", label: "层主" };

const INTENT_TEXT: Record<TrialIntent, string> = {
  attack: "攻击",
  guard: "举盾",
  charge: "蓄力",
};

function mod(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function themeFor(state: TrialGameState): TrialTheme {
  return TRIAL_THEMES[Math.min(state.floorIndex, TRIAL_THEMES.length - 1)];
}

/** 镜头目标：战斗中偏向敌人一点，让双方都在画面里。 */
export function focusCamera(state: TrialGameState): number {
  const hero = state.hero;
  const focus = state.enemy ? hero.x * 0.62 + state.enemy.x * 0.38 : hero.x;
  return Math.min(TRIAL_WORLD_W - TRIAL_VIEW_W, Math.max(0, focus - TRIAL_VIEW_W / 2));
}

export function smoothCamera(previous: number, target: number): number {
  if (previous < 0) return target;
  const next = previous + (target - previous) * 0.18;
  return Math.abs(next - target) < 0.4 ? target : next;
}

/* ------------------------------------------------------------------ 背景 */

function drawBackground(
  ctx: CanvasRenderingContext2D,
  state: TrialGameState,
  cam: number,
  theme: TrialTheme,
  now: number,
): void {
  const sky = ctx.createLinearGradient(0, 0, 0, TRIAL_VIEW_H);
  sky.addColorStop(0, theme.sky[0]);
  sky.addColorStop(0.72, theme.sky[1]);
  sky.addColorStop(1, theme.horizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, TRIAL_VIEW_W, TRIAL_VIEW_H);

  // 星屑：位置由种子决定，镜头缓慢视差。
  for (let i = 0; i < 46; i += 1) {
    const px = mod(state.seed * (i * 73 + 17), 940) - cam * 0.08;
    const wrapped = mod(px, 940) - 40;
    if (wrapped < -4 || wrapped > TRIAL_VIEW_W + 4) continue;
    const py = mod(state.seed * (i * 37 + 11), 150) + 8;
    const twinkle = mod(state.tick + i * 13, 90) < 45 ? 1 : 0.45;
    ctx.globalAlpha = twinkle;
    ctx.fillStyle = theme.star;
    ctx.fillRect(Math.round(wrapped), Math.round(py), i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
  }
  ctx.globalAlpha = 1;

  // 月亮与光晕。
  const moonX = 392 - cam * 0.04;
  const moonY = 46;
  const halo = ctx.createRadialGradient(moonX, moonY, 4, moonX, moonY, 38);
  halo.addColorStop(0, "rgba(254,243,199,0.5)");
  halo.addColorStop(1, "rgba(254,243,199,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(moonX - 40, moonY - 40, 80, 80);
  ctx.fillStyle = "#fef3c7";
  ctx.beginPath();
  ctx.arc(moonX, moonY, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(180,160,120,0.35)";
  ctx.fillRect(moonX - 6, moonY - 3, 4, 3);
  ctx.fillRect(moonX + 2, moonY + 2, 3, 2);

  // 远层塔群。
  const farOffset = -cam * 0.22;
  ctx.fillStyle = theme.tower;
  for (let i = -1; i < 10; i += 1) {
    const wx = farOffset + i * 132 + mod(state.seed + i * 91, 46);
    const h = 40 + mod(state.seed + i * 53, 70);
    ctx.fillRect(Math.round(wx), TRIAL_GROUND_Y - h - 26, 22, h + 26);
    ctx.fillRect(Math.round(wx - 5), TRIAL_GROUND_Y - h - 34, 32, 10);
    ctx.fillStyle = theme.accentSoft;
    ctx.fillRect(Math.round(wx + 6), TRIAL_GROUND_Y - h - 18, 4, 3);
    ctx.fillStyle = theme.tower;
  }

  // 中景浮岛。
  const midOffset = -cam * 0.45;
  for (let i = -1; i < 8; i += 1) {
    const wx = midOffset + i * 210 + mod(state.seed + i * 37, 80);
    const wy = 128 + mod(state.seed + i * 17, 24);
    ctx.fillStyle = theme.island;
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.lineTo(wx + 64, wy);
    ctx.lineTo(wx + 46, wy + 16);
    ctx.lineTo(wx + 18, wy + 22);
    ctx.lineTo(wx + 4, wy + 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = theme.accentSoft;
    ctx.fillRect(wx + 18, wy - 12, 3, 14);
    ctx.fillRect(wx + 26, wy - 20, 3, 22);
    ctx.beginPath();
    ctx.moveTo(wx + 27.5, wy - 24);
    ctx.lineTo(wx + 34, wy - 14);
    ctx.lineTo(wx + 21, wy - 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.13)";
    ctx.fillRect(wx + 8, wy + 4, 12, 2);
    ctx.fillRect(wx + 28, wy + 6, 8, 2);
  }

  // 缓慢飘动的薄云。
  const drift = now * 0.004;
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 4; i += 1) {
    const cx = mod(i * 180 + drift - cam * 0.3, TRIAL_VIEW_W + 220) - 110;
    const cy = 90 + i * 18;
    ctx.fillRect(Math.round(cx), cy, 74, 5);
    ctx.fillRect(Math.round(cx + 12), cy - 5, 44, 5);
  }

  // 光圈边缘。
  const vignette = ctx.createRadialGradient(
    TRIAL_VIEW_W / 2,
    TRIAL_VIEW_H / 2,
    120,
    TRIAL_VIEW_W / 2,
    TRIAL_VIEW_H / 2,
    300,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, TRIAL_VIEW_W, TRIAL_VIEW_H);
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  state: TrialGameState,
  cam: number,
  theme: TrialTheme,
): void {
  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, TRIAL_GROUND_Y, TRIAL_VIEW_W, TRIAL_VIEW_H - TRIAL_GROUND_Y);
  ctx.fillStyle = theme.edge;
  ctx.fillRect(0, TRIAL_GROUND_Y, TRIAL_VIEW_W, 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, TRIAL_GROUND_Y + 2, TRIAL_VIEW_W, 3);

  const offset = mod(-cam, 28);
  for (let x = offset - 28; x < TRIAL_VIEW_W + 28; x += 28) {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(Math.round(x), TRIAL_GROUND_Y + 6, 16, 2);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(Math.round(x + 14), TRIAL_GROUND_Y + 6, 2, TRIAL_VIEW_H - TRIAL_GROUND_Y);
  }

  // 平台下缘的浮空云。
  const cloudShift = mod(-cam * 0.6, 160);
  for (let i = -1; i < 4; i += 1) {
    const cx = cloudShift + i * 160;
    ctx.fillStyle = "rgba(148,163,184,0.08)";
    ctx.fillRect(Math.round(cx), TRIAL_GROUND_Y + 26, 96, 8);
    ctx.fillRect(Math.round(cx + 22), TRIAL_GROUND_Y + 20, 52, 8);
  }
}

/* ------------------------------------------------------------------ 门 */

function drawDoor(
  ctx: CanvasRenderingContext2D,
  x: number,
  cam: number,
  tone: { frame: string; glow: string; label: string },
  title: string,
  hint: string,
  active: boolean,
  faded: boolean,
): void {
  const sx = Math.round(x - cam);
  const base = TRIAL_GROUND_Y;
  const w = 36;
  const h = 62;

  ctx.save();
  ctx.globalAlpha = faded ? 0.35 : 1;

  // 门框
  ctx.fillStyle = tone.frame;
  ctx.fillRect(sx - w / 2, base - h, 5, h);
  ctx.fillRect(sx + w / 2 - 5, base - h, 5, h);
  ctx.fillRect(sx - w / 2, base - h, w, 5);
  ctx.fillRect(sx - w / 2 + 2, base - h - 6, w - 4, 4);

  // 门内辉光
  const glow = ctx.createLinearGradient(0, base - h + 5, 0, base);
  glow.addColorStop(0, tone.glow);
  glow.addColorStop(1, "rgba(2,6,23,0.9)");
  ctx.globalAlpha = faded ? 0.18 : active ? 0.85 : 0.5;
  ctx.fillStyle = glow;
  ctx.fillRect(sx - w / 2 + 5, base - h + 5, w - 10, h - 5);
  ctx.globalAlpha = faded ? 0.35 : 1;

  // 顶部宝石
  ctx.fillStyle = tone.glow;
  ctx.fillRect(sx - 2, base - h - 8, 4, 4);

  if (active) {
    const pulse = Math.floor(Date.now() / 180) % 2 === 0 ? 1 : 0;
    ctx.strokeStyle = tone.glow;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - w / 2 - 2 - pulse, base - h - 2 - pulse, w + 4 + pulse * 2, h + 4 + pulse * 2);
  }

  ctx.font = '10px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = "center";
  ctx.fillStyle = faded ? "#64748b" : "#f8fafc";
  ctx.fillText(title, sx, base - h - 12);
  if (faded || title !== tone.label) {
    ctx.font = '8px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = faded ? "#475569" : tone.glow;
    ctx.fillText(faded ? "已探索" : tone.label, sx, base - h - 24);
  }
  if (hint) {
    ctx.font = '8px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.shadowColor = "rgba(2,6,23,0.95)";
    ctx.shadowBlur = 3;
    ctx.fillStyle = faded ? "rgba(148,163,184,0.6)" : "rgba(226,232,240,0.85)";
    ctx.fillText(hint, sx, base + 13);
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

function drawDoors(
  ctx: CanvasRenderingContext2D,
  state: TrialGameState,
  cam: number,
): void {
  const floor = state.dungeon.floors[state.floorIndex];
  if (!floor || state.phase !== "explore") return;
  const heroX = state.hero.x;
  const explore = state.phase === "explore";

  floor.rooms.forEach((room, index) => {
    const x = TRIAL_DOOR_X[index] ?? TRIAL_DOOR_X[TRIAL_DOOR_X.length - 1];
    const near = explore && !state.fieldCleared && Math.abs(heroX - x) <= TRIAL_INTERACT_RADIUS;
    drawDoor(
      ctx,
      x,
      cam,
      ROOM_TONE[room.kind],
      room.title,
      room.kind === "fight" ? (room.wave?.title ?? "") : room.hint,
      near,
      state.fieldCleared,
    );
  });

  const boss = floor.boss;
  const nearBoss = explore && Math.abs(heroX - TRIAL_BOSS_DOOR_X) <= TRIAL_INTERACT_RADIUS;
  drawDoor(
    ctx,
    TRIAL_BOSS_DOOR_X,
    cam,
    BOSS_TONE,
    `层主 · ${boss.wave?.name ?? "???"}`,
    state.fieldCleared ? "上楼之门" : "可跳过野区直接挑战",
    nearBoss,
    false,
  );
}

/* ------------------------------------------------------------------ 主角 */

function drawHero(
  ctx: CanvasRenderingContext2D,
  state: TrialGameState,
  cam: number,
  theme: TrialTheme,
): void {
  const hero = state.hero;
  if (hero.invuln > 0 && Math.floor(state.tick / 3) % 2 === 0) return;

  const sx = Math.round(hero.x - cam);
  const sy = Math.round(hero.y);
  const airborne = hero.y < TRIAL_GROUND_Y;
  const runFrame = Math.floor(state.tick / 6) % 2;
  const swing = hero.moving && !airborne ? (runFrame === 0 ? 3 : -3) : 0;

  // 影子
  const shadowScale = airborne ? 0.6 : 1;
  ctx.fillStyle = "rgba(2,6,23,0.55)";
  ctx.beginPath();
  ctx.ellipse(sx, TRIAL_GROUND_Y + 1, 11 * shadowScale, 3 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(sx, sy);
  if (hero.facing < 0) ctx.scale(-1, 1);

  const hurt = hero.hurtFlash > 0;
  if (hurt) ctx.filter = "brightness(2.2)";

  // 腿
  ctx.fillStyle = hurt ? "#fecdd3" : "#1e1b4b";
  ctx.fillRect(-6 + swing, -10, 4, 10);
  ctx.fillRect(2 - swing, -10, 4, 10);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(-7 + swing, -2, 6, 3);
  ctx.fillRect(1 - swing, -2, 6, 3);

  // 披风
  ctx.fillStyle = hurt ? "#fda4af" : "#4338ca";
  ctx.beginPath();
  ctx.moveTo(-8, -27);
  ctx.lineTo(7, -27);
  ctx.lineTo(11, -8);
  ctx.lineTo(4, -4);
  ctx.lineTo(0, -11);
  ctx.lineTo(-7, -4);
  ctx.lineTo(-12, -9);
  ctx.closePath();
  ctx.fill();

  // 围巾
  ctx.fillStyle = theme.accent;
  const scarfWave = hero.moving ? (runFrame === 0 ? 1 : -1) : 0;
  ctx.fillRect(-14, -29 + scarfWave, 7, 3);
  ctx.fillRect(-18, -27 - scarfWave, 5, 3);

  // 躯干与肩甲
  ctx.fillStyle = hurt ? "#ffe4e6" : "#6366f1";
  ctx.fillRect(-6, -28, 12, 12);
  ctx.fillStyle = hurt ? "#fecdd3" : "#a5b4fc";
  ctx.fillRect(-8, -28, 4, 5);
  ctx.fillRect(4, -28, 4, 5);
  ctx.fillStyle = "#c7d2fe";
  ctx.fillRect(-1, -26, 2, 8);

  // 头与兜帽
  ctx.fillStyle = hurt ? "#ffe4e6" : "#312e81";
  ctx.fillRect(-5, -39, 10, 10);
  ctx.fillStyle = "#1e1b4b";
  ctx.fillRect(-4, -35, 8, 5);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(-3, -34, 2, 2);
  ctx.fillRect(1, -34, 2, 2);
  ctx.fillStyle = "#4f46e5";
  ctx.fillRect(-6, -40, 6, 3);

  // 剑与剑技
  const attack = hero.attack;
  let swordAngle = -24;
  if (attack) {
    const total = attack.kind === "arc" ? 24 : attack.kind === "burst" ? 30 : 16;
    const progress = Math.min(1, attack.frame / total);
    if (attack.kind === "slash") swordAngle = -120 + progress * 175;
    else if (attack.kind === "arc") swordAngle = -150 + progress * 215;
  }
  if (attack && attack.kind !== "burst") {
    ctx.save();
    ctx.translate(5, -24);
    ctx.rotate((swordAngle * Math.PI) / 180);
    ctx.fillStyle = "#fde68a";
    ctx.fillRect(-1, -20, 2, 20);
    ctx.fillStyle = "#fef9c3";
    ctx.fillRect(-1, -20, 1, 8);
    ctx.fillStyle = "#a16207";
    ctx.fillRect(-3, -1, 6, 2);
    ctx.fillStyle = "#78350f";
    ctx.fillRect(-1, 1, 2, 3);
    ctx.restore();

    if (attack.frame >= 4 && attack.frame <= 12) {
      ctx.globalAlpha = attack.kind === "arc" ? 0.55 : 0.4;
      ctx.strokeStyle = attack.kind === "arc" ? theme.accent : "#fef9c3";
      ctx.lineWidth = attack.kind === "arc" ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(4, -22, attack.kind === "arc" ? 24 : 19, -1.9, 0.9);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  } else {
    ctx.save();
    ctx.translate(6, -24);
    ctx.rotate((swordAngle * Math.PI) / 180);
    ctx.fillStyle = "#fde68a";
    ctx.fillRect(-1, -17, 2, 17);
    ctx.fillStyle = "#a16207";
    ctx.fillRect(-3, -1, 6, 2);
    ctx.restore();
  }

  // 星屑飞溅：自身周围的扩散环
  if (attack?.kind === "burst" && attack.frame >= 4 && attack.frame <= 20) {
    const radius = 8 + attack.frame * 3.2;
    ctx.globalAlpha = Math.max(0, 0.7 - attack.frame / 32);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -18, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#fef9c3";
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2 + attack.frame * 0.18;
      ctx.fillRect(
        Math.cos(angle) * radius - 1,
        -18 + Math.sin(angle) * radius - 1,
        2,
        2,
      );
    }
    ctx.globalAlpha = 1;
  }

  // 格挡盾
  if (hero.guarding) {
    ctx.strokeStyle = "#7dd3fc";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(9, -22, 12, -1.2, 1.2);
    ctx.stroke();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(9, -22, 12, -1.2, 1.2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ 怪物 */

function enemyPalette(shape: TrialWaveShape): { body: string; dark: string; glow: string } {
  switch (shape) {
    case "wisp":
      return { body: "#f59e0b", dark: "#7c2d12", glow: "#fef3c7" };
    case "golem":
      return { body: "#94a3b8", dark: "#334155", glow: "#fbbf24" };
    case "serpent":
      return { body: "#a78bfa", dark: "#4c1d95", glow: "#fef08a" };
    case "thorn":
      return { body: "#fb7185", dark: "#881337", glow: "#fecdd3" };
    case "mirror":
      return { body: "#67e8f9", dark: "#0c4a6e", glow: "#e0f2fe" };
    case "warden":
      return { body: "#4338ca", dark: "#020617", glow: "#facc15" };
    default:
      return { body: "#4ade80", dark: "#064e3b", glow: "#d9f99d" };
  }
}

function drawEnemyBody(
  ctx: CanvasRenderingContext2D,
  shape: TrialWaveShape,
  tick: number,
): void {
  const palette = enemyPalette(shape);
  const bob = Math.floor(tick / 24) % 2;

  switch (shape) {
    case "mire": {
      ctx.fillStyle = palette.body;
      ctx.beginPath();
      ctx.ellipse(0, -13, 16, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.dark;
      ctx.beginPath();
      ctx.ellipse(0, -9, 12, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.glow;
      ctx.fillRect(-8, -16, 4, 4);
      ctx.fillRect(4, -16, 4, 4);
      ctx.fillStyle = "#022c22";
      ctx.fillRect(-7, -15, 2, 2);
      ctx.fillRect(5, -15, 2, 2);
      ctx.fillStyle = palette.body;
      ctx.fillRect(-14, -24, 3, 5);
      ctx.fillRect(11, -24, 3, 5);
      break;
    }
    case "wisp": {
      const lift = bob * 2;
      const glow = ctx.createRadialGradient(0, -30 - lift, 2, 0, -30 - lift, 22);
      glow.addColorStop(0, "rgba(254,243,199,0.9)");
      glow.addColorStop(1, "rgba(245,158,11,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(-22, -52 - lift, 44, 44);
      ctx.fillStyle = palette.body;
      ctx.beginPath();
      ctx.arc(0, -30 - lift, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.glow;
      ctx.beginPath();
      ctx.moveTo(0, -18 - lift);
      ctx.lineTo(6, -6 - lift + bob);
      ctx.lineTo(-2, -10 - lift);
      ctx.lineTo(-6, -4 - lift);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = palette.dark;
      ctx.fillRect(-7, -34 - lift, 4, 4);
      ctx.fillRect(3, -34 - lift, 4, 4);
      break;
    }
    case "golem": {
      ctx.fillStyle = palette.body;
      ctx.fillRect(-15, -36, 30, 36);
      ctx.fillStyle = palette.dark;
      ctx.fillRect(-15, -36, 30, 6);
      ctx.fillRect(-15, -10, 30, 6);
      ctx.fillRect(-22, -30, 7, 18);
      ctx.fillRect(15, -30, 7, 18);
      ctx.fillStyle = palette.glow;
      ctx.fillRect(-9, -27, 6, 6);
      ctx.fillRect(3, -27, 6, 6);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(-7, -25, 2, 2);
      ctx.fillRect(5, -25, 2, 2);
      ctx.fillStyle = palette.glow;
      ctx.fillRect(-6, -16, 12, 3);
      ctx.fillRect(-4, -20, 8, 2);
      break;
    }
    case "serpent": {
      ctx.strokeStyle = palette.body;
      ctx.lineWidth = 9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-14, -2);
      ctx.quadraticCurveTo(18, -2, 12, -18);
      ctx.quadraticCurveTo(6, -32, -8, -28);
      ctx.quadraticCurveTo(-18, -25, -12, -38);
      ctx.stroke();
      ctx.strokeStyle = palette.dark;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.body;
      ctx.fillRect(-18, -46 + bob, 14, 10);
      ctx.fillStyle = palette.dark;
      ctx.fillRect(-15, -43 + bob, 8, 5);
      ctx.fillStyle = palette.glow;
      ctx.fillRect(-13, -42 + bob, 2, 2);
      ctx.fillRect(-9, -42 + bob, 2, 2);
      break;
    }
    case "thorn": {
      ctx.fillStyle = palette.dark;
      ctx.beginPath();
      for (let i = 0; i < 12; i += 1) {
        const angle = (i / 12) * Math.PI * 2 + Math.PI / 12;
        const radius = i % 2 === 0 ? 22 : 10;
        const px = Math.cos(angle) * radius;
        const py = -20 + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = palette.body;
      ctx.beginPath();
      ctx.arc(0, -20, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = palette.glow;
      ctx.fillRect(-5, -22, 3, 3);
      ctx.fillRect(2, -22, 3, 3);
      ctx.fillStyle = palette.dark;
      ctx.fillRect(-2, -15, 4, 2);
      break;
    }
    case "mirror": {
      ctx.fillStyle = palette.body;
      ctx.beginPath();
      ctx.moveTo(0, -46 + bob);
      ctx.lineTo(15, -22);
      ctx.lineTo(0, 0);
      ctx.lineTo(-15, -22);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = palette.glow;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = palette.dark;
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.arc(0, -23, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.glow;
      ctx.fillRect(-2, -25, 4, 4);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillRect(-9, -32, 2, 10);
      break;
    }
    case "warden": {
      ctx.fillStyle = palette.dark;
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.lineTo(-14, -42);
      ctx.lineTo(0, -52);
      ctx.lineTo(14, -42);
      ctx.lineTo(18, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = palette.body;
      ctx.fillRect(-6, -44, 12, 10);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(-4, -42, 8, 6);
      ctx.fillStyle = palette.glow;
      ctx.fillRect(-2, -40, 1, 2);
      ctx.fillRect(1, -40, 1, 2);
      const lift = bob * 2;
      const lamp = ctx.createRadialGradient(19, -30 - lift, 1, 19, -30 - lift, 16);
      lamp.addColorStop(0, "rgba(250,204,21,0.9)");
      lamp.addColorStop(1, "rgba(250,204,21,0)");
      ctx.fillStyle = lamp;
      ctx.fillRect(3, -46 - lift, 32, 32);
      ctx.fillStyle = palette.glow;
      ctx.fillRect(16, -30 - lift, 6, 6);
      break;
    }
  }
}

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  state: TrialGameState,
  cam: number,
): void {
  const enemy = state.enemy;
  if (!enemy) return;
  const sx = Math.round(enemy.x - cam);
  const scale = enemy.boss ? 1.45 : 1;
  const y = TRIAL_GROUND_Y;

  ctx.fillStyle = "rgba(2,6,23,0.55)";
  ctx.beginPath();
  ctx.ellipse(sx, y + 1, 16 * scale, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // 蓄力 / 狂暴 / 护盾光环
  if (enemy.mode === "charge") {
    ctx.globalAlpha = 0.35 + (state.tick % 20) * 0.02;
    ctx.strokeStyle = "#c084fc";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, y - 24 * scale, 26 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (enemy.enraged) {
    ctx.globalAlpha = 0.18 + (state.tick % 16) * 0.015;
    ctx.fillStyle = "#f43f5e";
    ctx.beginPath();
    ctx.arc(sx, y - 24 * scale, 26 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (enemy.shield > 0) {
    ctx.strokeStyle = "#38bdf8";
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx, y - 24 * scale, 24 * scale, -Math.PI * 0.9, Math.PI * 0.9);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#7dd3fc";
    ctx.font = '8px "Courier New", monospace';
    ctx.textAlign = "center";
    ctx.fillText(String(enemy.shield), sx, y - 48 * scale);
  }

  ctx.save();
  ctx.translate(sx, y);
  if (enemy.facing < 0) ctx.scale(-1, 1);
  ctx.scale(scale, scale);
  if (enemy.hurtFlash > 0) ctx.filter = "brightness(2.4)";
  drawEnemyBody(ctx, enemy.shape, state.tick);
  ctx.restore();

  // 抬手预警
  if (enemy.mode === "windup") {
    const flash = Math.floor(state.tick / 4) % 2 === 0;
    ctx.fillStyle = flash ? "#fbbf24" : "#f97316";
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.textAlign = "center";
    ctx.fillText("!", sx, y - 62 * scale);
  }

  // 血条
  const barW = enemy.boss ? 92 : 44;
  const barY = y - (enemy.boss ? 76 : 58) * scale;
  ctx.fillStyle = "rgba(2,6,23,0.75)";
  ctx.fillRect(sx - barW / 2 - 1, barY - 1, barW + 2, 6);
  ctx.fillStyle = enemy.boss ? "#f43f5e" : "#fb7185";
  const ratio = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
  ctx.fillRect(sx - barW / 2, barY, Math.round(barW * ratio), 4);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(sx - barW / 2, barY, Math.round(barW * ratio), 1);
  ctx.font = enemy.boss
    ? '9px "PingFang SC", "Microsoft YaHei", sans-serif'
    : '8px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = "center";
  ctx.fillStyle = enemy.boss ? "#fecdd3" : "#e2e8f0";
  ctx.fillText(enemy.name, sx, barY - 5);
  const intent = enemy.pattern[enemy.intentIndex % enemy.pattern.length] ?? "attack";
  ctx.font = '7px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = enemy.charged ? "#f0abfc" : "rgba(203,213,225,0.72)";
  ctx.fillText(enemy.charged ? "重击蓄势" : `意图：${INTENT_TEXT[intent]}`, sx, barY + 12);
}

/* ------------------------------------------------------------------ 特效 */

export type TrialFxKind = "spark" | "text" | "heal" | "ring";

export interface TrialFx {
  kind: TrialFxKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
}

export function spawnTrialFx(fx: TrialFx[], events: TrialEvent[], state: TrialGameState): void {
  for (const event of events) {
    switch (event.type) {
      case "hit": {
        fx.push({
          kind: "text",
          x: event.x,
          y: event.y,
          vx: 0,
          vy: -0.55,
          life: 46,
          maxLife: 46,
          text: `-${event.amount}`,
          color: event.combo >= 3 ? "#fbbf24" : "#fef9c3",
          size: event.combo >= 3 ? 12 : 10,
        });
        for (let i = 0; i < 6; i += 1) {
          fx.push({
            kind: "spark",
            x: event.x,
            y: event.y,
            vx: Math.cos((i / 6) * Math.PI * 2) * 1.6,
            vy: Math.sin((i / 6) * Math.PI * 2) * 1.6 - 0.6,
            life: 20,
            maxLife: 20,
            text: "",
            color: i % 2 === 0 ? "#fef9c3" : "#fbbf24",
            size: 2,
          });
        }
        break;
      }
      case "hurt": {
        fx.push({
          kind: "text",
          x: event.x,
          y: event.y,
          vx: 0,
          vy: -0.5,
          life: 44,
          maxLife: 44,
          text: event.blocked > 0 ? `-${event.amount} (挡 ${event.blocked})` : `-${event.amount}`,
          color: "#fda4af",
          size: 10,
        });
        for (let i = 0; i < 5; i += 1) {
          fx.push({
            kind: "spark",
            x: event.x,
            y: event.y,
            vx: (i % 2 === 0 ? 1 : -1) * (0.6 + i * 0.2),
            vy: -1.2 + i * 0.2,
            life: 18,
            maxLife: 18,
            text: "",
            color: "#fb7185",
            size: 2,
          });
        }
        break;
      }
      case "block": {
        fx.push({
          kind: "text",
          x: event.x,
          y: event.y,
          vx: 0,
          vy: -0.45,
          life: 36,
          maxLife: 36,
          text: `格挡 ${event.amount}`,
          color: "#7dd3fc",
          size: 9,
        });
        break;
      }
      case "heal": {
        fx.push({
          kind: "text",
          x: event.x,
          y: event.y,
          vx: 0,
          vy: -0.5,
          life: 40,
          maxLife: 40,
          text: `+${event.amount}`,
          color: "#6ee7b7",
          size: 10,
        });
        break;
      }
      case "kill": {
        fx.push({
          kind: "text",
          x: event.x,
          y: event.y,
          vx: 0,
          vy: -0.4,
          life: 50,
          maxLife: 50,
          text: "击破",
          color: "#fbbf24",
          size: 11,
        });
        for (let i = 0; i < 10; i += 1) {
          fx.push({
            kind: "spark",
            x: event.x,
            y: event.y,
            vx: Math.cos((i / 10) * Math.PI * 2) * 2.2,
            vy: Math.sin((i / 10) * Math.PI * 2) * 2.2 - 0.8,
            life: 26,
            maxLife: 26,
            text: "",
            color: i % 2 === 0 ? "#fef9c3" : "#f472b6",
            size: 2,
          });
        }
        break;
      }
      case "relic": {
        fx.push({
          kind: "ring",
          x: event.x,
          y: event.y,
          vx: 0,
          vy: 0,
          life: 34,
          maxLife: 34,
          text: "",
          color: "#fbbf24",
          size: 4,
        });
        fx.push({
          kind: "text",
          x: event.x,
          y: event.y,
          vx: 0,
          vy: -0.4,
          life: 50,
          maxLife: 50,
          text: "获得装备",
          color: "#fcd34d",
          size: 9,
        });
        break;
      }
      case "levelup": {
        fx.push({
          kind: "ring",
          x: event.x,
          y: event.y,
          vx: 0,
          vy: 0,
          life: 40,
          maxLife: 40,
          text: "",
          color: "#67e8f9",
          size: 4,
        });
        fx.push({
          kind: "text",
          x: event.x,
          y: event.y,
          vx: 0,
          vy: -0.45,
          life: 54,
          maxLife: 54,
          text: `LEVEL ${event.level}`,
          color: "#67e8f9",
          size: 10,
        });
        break;
      }
      default:
        break;
    }
    if (event.type === "door") {
      fx.push({
        kind: "text",
        x: state.hero.x,
        y: state.hero.y - 50,
        vx: 0,
        vy: -0.5,
        life: 40,
        maxLife: 40,
        text: event.label,
        color: "#e2e8f0",
        size: 9,
      });
    }
  }
}

export function updateTrialFx(fx: TrialFx[], dt: number): void {
  const stepScale = Math.min(3, dt / 16.67);
  for (let i = fx.length - 1; i >= 0; i -= 1) {
    const item = fx[i];
    item.life -= stepScale;
    item.x += item.vx * stepScale;
    item.y += item.vy * stepScale;
    if (item.kind === "spark") item.vy += 0.08 * stepScale;
    if (item.kind === "text") item.vy *= 0.985;
    if (item.life <= 0) fx.splice(i, 1);
  }
}

export function drawTrialFx(
  ctx: CanvasRenderingContext2D,
  fx: TrialFx[],
  cam: number,
): void {
  for (const item of fx) {
    const alpha = Math.max(0, Math.min(1, item.life / item.maxLife));
    const sx = Math.round(item.x - cam);
    const sy = Math.round(item.y);
    ctx.globalAlpha = alpha;
    if (item.kind === "spark") {
      ctx.fillStyle = item.color;
      ctx.fillRect(sx, sy, item.size, item.size);
    } else if (item.kind === "ring") {
      const radius = item.size + (1 - alpha) * 22;
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.font = `${item.size}px "Courier New", "PingFang SC", monospace`;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(2,6,23,0.65)";
      ctx.fillText(item.text, sx + 1, sy + 1);
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }
}

/* ------------------------------------------------------------------ 入口 */

/** 画一帧完整场景。`camera` 由外部平滑后传入（未取整），内部统一取整保持像素对齐。 */
export function drawTrialScene(
  ctx: CanvasRenderingContext2D,
  state: TrialGameState,
  fx: TrialFx[],
  camera: number,
  now: number,
): void {
  const cam = Math.round(camera);
  const theme = themeFor(state);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, TRIAL_VIEW_W, TRIAL_VIEW_H);

  // 受击震屏
  let shakeX = 0;
  let shakeY = 0;
  if (state.hero.hurtFlash > 6) {
    const phase = state.tick % 4;
    shakeX = phase === 0 ? 1 : phase === 1 ? -1 : 0;
    shakeY = phase === 2 ? 1 : 0;
  }

  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawBackground(ctx, state, cam, theme, now);
  drawGround(ctx, state, cam, theme);
  drawDoors(ctx, state, cam);
  drawEnemy(ctx, state, cam);
  drawHero(ctx, state, cam, theme);

  // 起始点的小灯柱
  const startX = TRIAL_HERO_START_X - cam;
  ctx.fillStyle = "rgba(103,232,249,0.7)";
  ctx.fillRect(startX - 1, TRIAL_GROUND_Y - 34, 2, 34);
  ctx.fillRect(startX - 3, TRIAL_GROUND_Y - 36, 6, 3);

  // 刷怪口
  if (state.enemy) {
    const portalX = TRIAL_ENEMY_SPAWN_X - cam;
    ctx.globalAlpha = 0.25 + (state.tick % 30) * 0.008;
    ctx.fillStyle = "#a855f7";
    ctx.fillRect(portalX - 2, TRIAL_GROUND_Y - 40, 4, 40);
    ctx.globalAlpha = 1;
  }

  drawTrialFx(ctx, fx, cam);
  ctx.restore();

  // 便携提示：站在门边时在画面底部画 F 键。
  if (state.phase === "explore") {
    const near = (x: number) => Math.abs(state.hero.x - x) <= TRIAL_INTERACT_RADIUS;
    const doorX = TRIAL_DOOR_X.find((x) => !state.fieldCleared && near(x));
    if (doorX !== undefined || near(TRIAL_BOSS_DOOR_X)) {
      const keyX = Math.round(state.hero.x - cam);
      const keyY = Math.round(state.hero.y) - 58;
      ctx.fillStyle = "rgba(2,6,23,0.8)";
      ctx.fillRect(keyX - 8, keyY - 10, 16, 14);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(keyX - 8, keyY - 10, 16, 14);
      ctx.fillStyle = theme.accent;
      ctx.font = 'bold 9px "Courier New", monospace';
      ctx.textAlign = "center";
      ctx.fillText("F", keyX, keyY + 1);
    }
  }
}
