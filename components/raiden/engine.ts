import { createBackdrop, type Backdrop } from "./background";
import { RaidenAudio } from "./audio";
import {
  ballistics,
  BOMB_PICKUP_COLOR,
  clampWeaponLevel,
  isBulletType,
  LOOT_PICKUP_COLOR,
  MAX_LEVEL_SCORE,
  MAX_WEAPON_LEVEL,
  randomBulletType,
  rollSupplyDrop,
  WEAPONS,
  type Ballistics,
  type BulletType,
} from "./weapons";
import { STAGE_DEFS, stageDef, type EnemyKind, type EnemySpawn, type PowerType, type StageDef } from "./stages";

/**
 * 雷电行动的游戏引擎：纯 Canvas 2D + 自绘矢量机体，不依赖任何图片/音频资源。
 *
 * 引擎只负责「玩」与表现：计分、碰撞、关卡节奏、Boss。钱与进度全部在服务端，
 * 通关/阵亡时通过回调把结算交给 React 层，由它调 server action。
 */

export type { BulletType } from "./weapons";
export { MAX_WEAPON_LEVEL, WEAPONS } from "./weapons";

export const FIELD_W = 480;
export const FIELD_H = 720;
/** 炸弹上限：基础 3 颗 + 买满 10 份。 */
export const MAX_BOMBS = 13;

/** 战机 HP 与「击杀回满」节奏。 */
export const PLAYER_MAX_HP = 100;
export const HP_HEAL_KILLS = 25;

/** 出击商店买到的护盾持续 16 秒。 */
export const SHIELD_PURCHASE_SECONDS = 16;

const PLAYER_R = 5;
const PLAYER_SPEED = 330;
const ENEMY_BULLET_R = 4;
const READY_SECONDS = 3.2;
/** 补给箱的判定半径：捡到 / 被打到改写字母都用它，视觉和手感一致。 */
const PICKUP_R = 13;

export type GameState = "ready" | "playing" | "stageclear" | "gameover" | "ended";

export interface HudSnapshot {
  score: number;
  lives: number;
  bombs: number;
  /** 当前子弹类型（唯一激活的一种）。 */
  weapon: BulletType;
  /** 当前类型的等级；切换类型会掉回 1。 */
  weaponLevel: number;
  maxWeaponLevel: number;
  stage: number;
  stageCount: number;
  stageTime: number;
  bossHp: number | null;
  bossName: string | null;
  paused: boolean;
  state: GameState;
  shield: boolean;
  shieldTime: number;
  readyIn: number;
  /** 当前/最大机体 HP。 */
  hp: number;
  maxHp: number;
  kills: number;
  /** 下一档击杀回满的门槛。 */
  healAt: number;
  /** 本关拾取到的战利品（cr），通关时并入结算。 */
  loot: number;
}

export interface StageClearResult {
  stage: number;
  stageScore: number;
  totalScore: number;
  durationMs: number;
  /** 本关精英/Boss 掉落的战利品 cr。 */
  loot: number;
}

export interface GameOverResult {
  stage: number;
  totalScore: number;
}

export interface EngineCallbacks {
  onHud(hud: HudSnapshot): void;
  onStageClear(result: StageClearResult): void;
  onGameOver(result: GameOverResult): void;
  onToast?(message: string): void;
  onPauseChange?(paused: boolean): void;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  /** `power` 是出击商店买出来的初始机炮等级（1~11），初始类型固定 W。 */
  starting: { power: number; bombs: number; lives: number; shield: boolean };
  muted?: boolean;
  callbacks: EngineCallbacks;
}

interface PlayerBullet {
  kind: "cannon" | "missile" | "laser" | "shell";
  /** 发射时的武器类型，绘制与音效按它取色。 */
  weapon: BulletType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  /** 导弹 / 榴弹的存活时间；机炮与激光恒为 0。 */
  ttl: number;
  /** 激光剩余穿透次数（0 表示不穿透）。 */
  pierce: number;
  /** 命中后的溅射半径（榴弹、导弹用；0 表示不溅射）。 */
  blastR: number;
  /** 激光两次命中之间的冷却。 */
  hitGap: number;
  dead: boolean;
}

interface EnemyBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  dead: boolean;
}

interface Enemy {
  kind: EnemyKind;
  x: number;
  y: number;
  baseX: number;
  vy: number;
  vx: number;
  hp: number;
  maxHp: number;
  r: number;
  score: number;
  t: number;
  fireT: number;
  shots: number;
  sway: number;
  seed: number;
  hoverY: number;
  activeT: number;
  state: "enter" | "active" | "leave";
  elite: boolean;
  drop: PowerType | null;
  dir: 1 | -1;
  flash: number;
  dead: boolean;
}

type PickupType = PowerType | "C";

interface PowerUp {
  x: number;
  y: number;
  vy: number;
  t: number;
  type: PickupType;
  /** 战利品（C）的 cr 面额；其它补给为 0。 */
  value: number;
  /** 被子弹打中后字母闪烁的剩余时间。 */
  shuffle: number;
}

type ObstacleKind = "mine" | "barrier" | "barricade" | "container" | "asteroid" | "debris";

/** 地面/水面障碍：能挡路、撞机、被打掉，用来填充关卡节奏。 */
interface Obstacle {
  kind: ObstacleKind;
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  score: number;
  t: number;
  drift: number;
  flash: number;
  dead: boolean;
}

interface Particle {
  kind: "spark" | "smoke" | "ring" | "debris";
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  rot?: number;
  spin?: number;
}

interface Beam {
  x: number;
  warn: number;
  active: number;
  hit: boolean;
}

interface DeferredBlast {
  x: number;
  y: number;
  delay: number;
  power: number;
  color: string;
}

interface BossState {
  stage: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  t: number;
  phase: number;
  flash: number;
  dying: number | null;
  fireA: number;
  fireB: number;
  fireC: number;
  spiralT: number;
  ringAngle: number;
  /** 副武器/召唤计时（各关 Boss 自行使用）。 */
  auxT: number;
  /** 炮塔 / 光环的自转角（第四、五关使用）。 */
  spin: number;
  trail: { x: number; y: number }[];
  segments: { x: number; y: number }[];
  beams: Beam[];
}

const MOVE_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
]);

const rand = (min: number, max: number): number => min + Math.random() * (max - min);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export class RaidenEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number;
  private cb: EngineCallbacks;
  private audio = new RaidenAudio();

  private running = true;
  private raf = 0;
  private lastTs = 0;
  private time = 0;
  private hudTimer = 0;

  private state: GameState = "playing";
  private paused = false;
  private stage = 1;
  private def: StageDef = stageDef(1);
  private backdrop: Backdrop;
  private stageTime = 0;
  private stageScore = 0;
  private score = 0;

  private lives: number;
  private bombs: number;
  private weaponType: BulletType = "W";
  private weaponLevel: number;
  private invincible = 2;
  /** 受击后的短暂硬直无敌，和护盾的长时间无敌分开。 */
  private hurtInvuln = 0;
  private hp = PLAYER_MAX_HP;
  private stageLoot = 0;
  private nextHealAt = HP_HEAL_KILLS;
  private readyIn = 0;
  private respawn = 0;
  private killCount = 0;

  private playerX = FIELD_W / 2;
  private playerY = FIELD_H - 100;
  private playerVX = 0;
  private fireCooldown = 0;
  private trailT = 0;

  private keys = new Set<string>();
  private pointer = {
    active: false,
    id: -1,
    startX: 0,
    startY: 0,
    baseX: FIELD_W / 2,
    baseY: FIELD_H - 100,
    targetX: FIELD_W / 2,
    targetY: FIELD_H - 100,
    hasTarget: false,
  };

  private bullets: PlayerBullet[] = [];
  private enemyBullets: EnemyBullet[] = [];
  private enemies: Enemy[] = [];
  private powerups: PowerUp[] = [];
  private obstacles: Obstacle[] = [];
  private particles: Particle[] = [];
  private blasts: DeferredBlast[] = [];
  private boss: BossState | null = null;
  private obstacleTimer = 5;

  private spawns: EnemySpawn[] = [];
  private spawnIndex = 0;

  private scroll = 0;
  private shake = 0;
  private flash = 0;
  private stageClearFired = false;
  private gameOverFired = false;
  private explodeSfxT = 0;
  private shuffleSfxT = 0;
  private toastT = 0;
  private vignette: HTMLCanvasElement | null = null;

  constructor(options: EngineOptions) {
    this.canvas = options.canvas;
    const ctx = options.canvas.getContext("2d");
    if (!ctx) throw new Error("当前浏览器不支持 Canvas 2D");
    this.ctx = ctx;
    this.dpr = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(FIELD_W * this.dpr);
    this.canvas.height = Math.round(FIELD_H * this.dpr);
    this.cb = options.callbacks;
    if (options.muted) this.audio.setMuted(true);

    this.lives = Math.max(1, options.starting.lives);
    this.bombs = clamp(Math.trunc(options.starting.bombs), 0, MAX_BOMBS);
    this.weaponLevel = clampWeaponLevel(options.starting.power);
    this.invincible = options.starting.shield ? SHIELD_PURCHASE_SECONDS : 2;
    this.hp = PLAYER_MAX_HP;

    this.vignette = this.createVignette();
    this.backdrop = createBackdrop(this.def.theme);
    this.bindEvents();
    this.emitHud(true);
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ----------------------------- 对外控制 ----------------------------- */

  setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  setPaused(paused: boolean): void {
    if (this.state !== "playing") return;
    if (this.paused === paused) return;
    this.paused = paused;
    this.pointer.active = false;
    this.cb.onPauseChange?.(paused);
    this.emitHud(true);
  }

  togglePause(): void {
    this.setPaused(!this.paused);
  }

  useBomb(): void {
    if (this.state !== "playing" || this.paused || this.respawn > 0) return;
    this.audio.unlock();
    if (this.bombs <= 0) {
      this.toast("炸弹已经用完了");
      return;
    }
    this.bombs -= 1;
    this.audio.play("bomb");
    this.flash = Math.max(this.flash, 0.6);
    this.shake = Math.max(this.shake, 16);
    this.invincible = Math.max(this.invincible, 1.4);

    for (const e of this.enemies) if (!e.dead) this.damageEnemy(e, 60);
    for (const o of this.obstacles) if (!o.dead) this.damageObstacle(o, 80);
    if (this.boss && this.boss.dying === null) this.damageBoss(130);
    for (const b of this.enemyBullets) {
      if (b.dead) continue;
      this.addScore(10);
      this.spawnSpark(b.x, b.y, "#ffe9a8", 2);
      b.dead = true;
    }
    this.spawnRing(this.playerX, this.playerY, "#9fe8ff", 320, 0.6);
    this.spawnRing(this.playerX, this.playerY, "#ffffff", 220, 0.45);
    this.emitHud(true);
  }

  /** 通关后由 React 层推进到下一关；`no` 从 1 开始。 */
  startStage(no: number): void {
    const def = stageDef(no);
    this.stage = def.no;
    this.def = def;
    this.stageTime = 0;
    this.stageScore = 0;
    this.spawns = def.spawns;
    this.spawnIndex = 0;
    this.boss = null;
    this.enemies = [];
    this.enemyBullets = [];
    this.bullets = [];
    this.powerups = [];
    this.obstacles = [];
    this.obstacleTimer = 5;
    this.particles = [];
    this.blasts = [];
    this.backdrop = createBackdrop(def.theme);
    this.scroll = 0;
    this.shake = 0;
    this.flash = 0;
    this.state = "ready";
    this.readyIn = READY_SECONDS;
    this.paused = false;
    this.stageClearFired = false;
    this.gameOverFired = false;
    this.respawn = 0;
    this.playerX = FIELD_W / 2;
    this.playerY = FIELD_H - 100;
    this.playerVX = 0;
    this.fireCooldown = 0;
    this.invincible = Math.max(this.invincible, 1.2);
    this.hurtInvuln = 0;
    this.hp = PLAYER_MAX_HP;
    this.stageLoot = 0;
    this.emitHud(true);
  }

  /** 付费复活：回到战场，给 3 秒无敌并清掉身边的弹幕。 */
  revive(): void {
    if (this.state !== "gameover") return;
    this.state = "playing";
    this.gameOverFired = false;
    this.lives = 1;
    this.respawn = 0;
    this.invincible = 3;
    this.hurtInvuln = 0;
    this.hp = PLAYER_MAX_HP;
    this.playerX = FIELD_W / 2;
    this.playerY = FIELD_H - 100;
    this.clearBulletsAround(this.playerX, this.playerY, 200);
    if (this.boss) {
      this.boss.beams = [];
      if (this.boss.dying === null) this.boss.fireA = Math.max(this.boss.fireA, 1.6);
    }
    this.audio.unlock();
    this.audio.play("revive");
    this.emitHud(true);
  }

  /** 主动结束一局（阵亡不复活 / 退出）：停止循环并解绑事件。 */
  dispose(): void {
    if (!this.running) return;
    this.running = false;
    this.state = "ended";
    cancelAnimationFrame(this.raf);
    this.unbindEvents();
    this.audio.close();
  }

  destroy(): void {
    this.dispose();
  }

  /* ----------------------------- 主循环 ----------------------------- */

  private loop = (ts: number): void => {
    if (!this.running) return;
    const rawDt = this.lastTs ? (ts - this.lastTs) / 1000 : 0;
    this.lastTs = ts;
    const dt = Math.min(Math.max(rawDt, 0), 1 / 30);

    this.hudTimer += rawDt;
    if (!this.paused) {
      if (this.state === "ready") {
        this.readyIn -= dt;
        if (this.readyIn <= 0) {
          this.readyIn = 0;
          this.state = "playing";
          this.invincible = Math.max(this.invincible, 1);
          this.emitHud(true);
        }
        this.updateParticles(dt);
        this.decayEffects(dt);
      } else if (this.state === "playing") {
        this.update(dt);
      } else {
        this.updateAmbient(dt);
      }
    }
    this.draw();
    this.emitHud();
    this.raf = requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    this.time += dt;
    this.scroll += this.backdrop.speed * dt;
    this.stageTime += dt;
    this.explodeSfxT = Math.max(0, this.explodeSfxT - dt);
    this.shuffleSfxT = Math.max(0, this.shuffleSfxT - dt);
    this.toastT = Math.max(0, this.toastT - dt);
    if (this.invincible > 0) this.invincible = Math.max(0, this.invincible - dt);
    if (this.hurtInvuln > 0) this.hurtInvuln = Math.max(0, this.hurtInvuln - dt);

    this.updatePlayer(dt);
    this.spawnDueWaves();
    this.updateObstacles(dt);
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateBullets(dt);
    this.updatePowerups(dt);
    this.updateParticles(dt);
    this.updateDeferredBlasts(dt);
    this.resolveCollisions();
    this.decayEffects(dt);

    if (!this.boss && !this.stageClearFired && this.stageTime >= this.def.bossAt) {
      this.spawnBoss();
    }

    this.bullets = this.bullets.filter((b) => !b.dead);
    this.enemyBullets = this.enemyBullets.filter((b) => !b.dead);
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (this.particles.length > 420) this.particles.splice(0, this.particles.length - 420);
  }

  /** 关卡结算/阵亡画面冻结时，只让粒子与屏幕效果继续。 */
  private updateAmbient(dt: number): void {
    this.time += dt;
    this.updateParticles(dt);
    this.decayEffects(dt);
  }

  private decayEffects(dt: number): void {
    this.shake = this.shake > 0.2 ? this.shake * Math.exp(-dt * 5.5) : 0;
    this.flash = Math.max(0, this.flash - dt * 2.2);
  }

  private emitHud(force = false): void {
    if (!force && this.hudTimer < 0.09) return;
    this.hudTimer = 0;
    this.cb.onHud({
      score: this.score,
      lives: this.lives,
      bombs: this.bombs,
      weapon: this.weaponType,
      weaponLevel: this.weaponLevel,
      maxWeaponLevel: MAX_WEAPON_LEVEL,
      stage: this.stage,
      stageCount: STAGE_DEFS.length,
      stageTime: this.stageTime,
      bossHp: this.boss ? (this.boss.dying === null ? this.boss.hp / this.boss.maxHp : 0) : null,
      bossName: this.boss ? this.def.boss.name : null,
      paused: this.paused,
      state: this.state,
      shield: this.invincible > 0,
      shieldTime: Math.max(0, this.invincible),
      readyIn: Math.max(0, this.readyIn),
      hp: Math.max(0, Math.round(this.hp)),
      maxHp: PLAYER_MAX_HP,
      kills: this.killCount,
      healAt: this.nextHealAt,
      loot: this.stageLoot,
    });
  }

  private toast(message: string): void {
    if (this.toastT > 0) return;
    this.toastT = 0.8;
    this.cb.onToast?.(message);
  }

  /* ----------------------------- 玩家 ----------------------------- */

  private updatePlayer(dt: number): void {
    if (this.respawn > 0) {
      this.respawn -= dt;
      if (this.respawn <= 0) this.invincible = Math.max(this.invincible, 2.5);
      return;
    }

    let dx = 0;
    let dy = 0;
    if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) dx -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) dx += 1;
    if (this.keys.has("ArrowUp") || this.keys.has("KeyW")) dy -= 1;
    if (this.keys.has("ArrowDown") || this.keys.has("KeyS")) dy += 1;

    const oldX = this.playerX;
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy) || 1;
      this.playerX += (dx / len) * PLAYER_SPEED * dt;
      this.playerY += (dy / len) * PLAYER_SPEED * dt;
      if (this.pointer.active) {
        this.pointer.hasTarget = false;
        this.pointer.active = false;
      }
    } else if (this.pointer.active && this.pointer.hasTarget) {
      const ease = 1 - Math.exp(-dt * 22);
      this.playerX += (this.pointer.targetX - this.playerX) * ease;
      this.playerY += (this.pointer.targetY - this.playerY) * ease;
    }

    this.playerX = clamp(this.playerX, 22, FIELD_W - 22);
    this.playerY = clamp(this.playerY, 54, FIELD_H - 26);
    this.playerVX = dt > 0 ? clamp((this.playerX - oldX) / dt, -420, 420) : 0;

    this.fireCooldown -= dt;
    if (this.fireCooldown <= 0) {
      this.fireCooldown = ballistics(this.weaponType, this.weaponLevel).interval;
      this.fireVolley();
    }

    // 尾焰粒子
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.035;
      this.particles.push({
        kind: "spark",
        x: this.playerX + rand(-3, 3),
        y: this.playerY + 20,
        vx: this.playerVX * 0.1,
        vy: 190 + rand(0, 60),
        life: 0.24,
        maxLife: 0.24,
        size: 3.2,
        color: "#7fd8ff",
      });
    }
  }

  /** 统一补齐子弹字段：五种弹道各自只描述差异部分。 */
  private addBullet(part: {
    kind: PlayerBullet["kind"];
    x: number;
    y: number;
    vx: number;
    vy: number;
    dmg: number;
    r?: number;
    ttl?: number;
    pierce?: number;
    blastR?: number;
  }): void {
    this.bullets.push({
      kind: part.kind,
      weapon: this.weaponType,
      x: part.x,
      y: part.y,
      vx: part.vx,
      vy: part.vy,
      r: part.r ?? 3.4,
      dmg: part.dmg,
      ttl: part.ttl ?? 0,
      pierce: part.pierce ?? 0,
      blastR: part.blastR ?? 0,
      hitGap: 0,
      dead: false,
    });
  }

  /** 按当前类型与等级打出一轮齐射；弹道参数全部来自 `weapons.ts` 的弹道表。 */
  private fireVolley(): void {
    const spec = ballistics(this.weaponType, this.weaponLevel);
    switch (this.weaponType) {
      case "W":
        this.fireCannon(spec);
        break;
      case "S":
        this.fireScatter(spec);
        break;
      case "M":
        this.fireMissiles(spec);
        break;
      case "L":
        this.fireLaser(spec);
        break;
      case "P":
        this.fireShells(spec);
        break;
    }
  }

  /** W 机炮：窄角直射，等级提升枪管数与射速，单体输出最稳。 */
  private fireCannon(spec: Ballistics): void {
    for (let i = 0; i < spec.streams; i += 1) {
      const angle = -Math.PI / 2 + (i - (spec.streams - 1) / 2) * spec.arc;
      this.addBullet({
        kind: "cannon",
        x: this.playerX + (i - (spec.streams - 1) / 2) * 4,
        y: this.playerY - 20,
        vx: Math.cos(angle) * spec.speed,
        vy: Math.sin(angle) * spec.speed,
        r: 3.4,
        dmg: spec.dmg,
      });
    }
    this.audio.play("shoot");
  }

  /** S 散射：一整个扇面的弹片，贴脸命中时总伤最高。 */
  private fireScatter(spec: Ballistics): void {
    for (let i = 0; i < spec.streams; i += 1) {
      const angle = -Math.PI / 2 + (i - (spec.streams - 1) / 2) * (spec.arc / Math.max(1, spec.streams - 1));
      this.addBullet({
        kind: "cannon",
        x: this.playerX + Math.cos(angle) * 9,
        y: this.playerY - 12 + Math.sin(angle) * 6,
        vx: Math.cos(angle) * spec.speed,
        vy: Math.sin(angle) * spec.speed,
        r: 3,
        dmg: spec.dmg,
      });
    }
    this.audio.play("shoot");
  }

  /** M 导弹：升空后散开并追踪最近目标，命中带小范围爆炸。 */
  private fireMissiles(spec: Ballistics): void {
    for (let i = 0; i < spec.streams; i += 1) {
      const side = spec.streams === 1 ? 1 : i % 2 === 0 ? -1 : 1;
      const offset = spec.streams === 1 ? 0 : (i - (spec.streams - 1) / 2) * 16;
      this.addBullet({
        kind: "missile",
        x: this.playerX + offset,
        y: this.playerY + 3,
        vx: side * 62,
        vy: -spec.speed,
        r: 6,
        dmg: spec.dmg,
        ttl: 3.6,
        blastR: spec.blastR,
      });
      this.spawnSpark(this.playerX + offset, this.playerY + 10, "#ffd27a", 2);
    }
    this.audio.play("missile");
  }

  /** L 激光：高速穿透光束，等级提升光束数与穿透次数。 */
  private fireLaser(spec: Ballistics): void {
    for (let i = 0; i < spec.streams; i += 1) {
      const offset = (i - (spec.streams - 1) / 2) * 13;
      this.addBullet({
        kind: "laser",
        x: this.playerX + offset,
        y: this.playerY - 26,
        vx: 0,
        vy: -spec.speed,
        r: 5,
        dmg: spec.dmg,
        pierce: spec.pierce,
      });
    }
    this.audio.play("laser");
  }

  /** P 榴弹：慢速弹体，命中即炸，靠溅射覆盖一群目标。 */
  private fireShells(spec: Ballistics): void {
    for (let i = 0; i < spec.streams; i += 1) {
      const angle = -Math.PI / 2 + (i - (spec.streams - 1) / 2) * spec.arc;
      this.addBullet({
        kind: "shell",
        x: this.playerX,
        y: this.playerY - 16,
        vx: Math.cos(angle) * spec.speed,
        vy: Math.sin(angle) * spec.speed,
        r: 6,
        dmg: spec.dmg,
        ttl: 4,
        blastR: spec.blastR,
      });
    }
    this.audio.play("shell");
  }

  /** 扣血；HP 见底才损失一条命。护盾与受击硬直期间不生效。 */
  private damagePlayer(amount: number): void {
    if (this.state !== "playing" || this.invincible > 0 || this.respawn > 0 || this.hurtInvuln > 0) {
      return;
    }
    this.hp = Math.max(0, this.hp - amount);
    this.hurtInvuln = 0.9;
    this.shake = Math.max(this.shake, 5);
    this.audio.play("hit");
    this.spawnSpark(this.playerX, this.playerY, "#ff8a8a", 8);
    if (this.hp <= 0) {
      this.killPlayer();
    } else {
      this.emitHud(true);
    }
  }

  private killPlayer(): void {
    if (this.state !== "playing" || this.respawn > 0) return;
    this.explode(this.playerX, this.playerY, 1.5, "#ffcf7a");
    this.audio.play("bigExplode");
    this.shake = Math.max(this.shake, 15);
    this.flash = Math.max(this.flash, 0.28);
    this.lives -= 1;
    this.invincible = 0;
    this.hurtInvuln = 0;
    this.hp = 0;
    this.clearBulletsAround(this.playerX, this.playerY, 150);

    if (this.lives <= 0) {
      this.state = "gameover";
      this.respawn = 0;
      if (!this.gameOverFired) {
        this.gameOverFired = true;
        this.audio.play("gameOver");
        this.cb.onGameOver({ stage: this.stage, totalScore: this.score });
      }
      this.emitHud(true);
    } else {
      this.respawn = 1.3;
      this.hp = PLAYER_MAX_HP;
      this.playerX = FIELD_W / 2;
      this.playerY = FIELD_H - 100;
      this.emitHud(true);
    }
  }

  private clearBulletsAround(x: number, y: number, radius: number): void {
    for (const b of this.enemyBullets) {
      if (!b.dead && distance(b.x, b.y, x, y) < radius) b.dead = true;
    }
  }

  /* ----------------------------- 敌人 ----------------------------- */

  private spawnDueWaves(): void {
    if (this.boss || this.stageClearFired) return;
    while (this.spawnIndex < this.spawns.length && this.spawns[this.spawnIndex].at <= this.stageTime) {
      this.spawnEnemy(this.spawns[this.spawnIndex]);
      this.spawnIndex += 1;
    }
  }

  private spawnEnemy(spawn: EnemySpawn, entryY = -34): void {
    const elite = spawn.elite === true;
    const config: Record<EnemyKind, { hp: number; r: number; score: number; vy: number; sway: number }> = {
      drone: { hp: 20, r: 13, score: 140, vy: 112, sway: 40 },
      gunship: { hp: 170, r: 27, score: 900, vy: 95, sway: 44 },
      turret: { hp: 78, r: 18, score: 420, vy: this.def.groundSpeed, sway: 0 },
      tank: { hp: 120, r: 22, score: 580, vy: this.def.groundSpeed * 0.82, sway: 0 },
      heli: { hp: 66, r: 17, score: 460, vy: 66, sway: 68 },
    };
    const base = config[spawn.kind];
    const hp = elite ? Math.round(base.hp * 3) : base.hp;
    this.enemies.push({
      kind: spawn.kind,
      x: spawn.x,
      y: entryY,
      baseX: spawn.x,
      vy: base.vy + rand(0, 18),
      vx: 0,
      hp,
      maxHp: hp,
      r: base.r,
      score: elite ? Math.round(base.score * 3) : base.score,
      t: rand(0, 3),
      fireT: rand(0.9, 1.8),
      shots: 0,
      sway: base.sway * rand(0.8, 1.2),
      seed: rand(0, Math.PI * 2),
      hoverY: spawn.kind === "gunship" ? rand(90, 150) : 0,
      activeT: 0,
      state: entryY < 0 && spawn.kind === "gunship" ? "enter" : "active",
      elite,
      drop: spawn.drop ?? null,
      dir: spawn.dir ?? 1,
      flash: 0,
      dead: false,
    });
  }

  private updateEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt * 6);
      e.fireT -= dt;
      if (e.hp < e.maxHp * 0.4 && Math.random() < dt * 7) {
        this.particles.push({
          kind: "smoke",
          x: e.x + rand(-e.r * 0.4, e.r * 0.4),
          y: e.y - e.r * 0.3,
          vx: rand(-10, 10),
          vy: rand(-32, -12),
          life: rand(0.3, 0.6),
          maxLife: 0.6,
          size: rand(3, 6),
          color: Math.random() < 0.35 ? "#ff8a52" : "#4a4a50",
        });
      }

      switch (e.kind) {
        case "drone":
          e.y += e.vy * dt;
          e.x = e.baseX + Math.sin(e.t * 2.4 + e.seed) * e.sway;
          break;
        case "heli":
          e.y += e.vy * dt;
          e.x = e.baseX + Math.sin(e.t * 1.7 + e.seed) * e.sway;
          break;
        case "turret":
          e.y += e.vy * dt;
          break;
        case "tank":
          e.y += e.vy * dt;
          e.x += e.dir * 52 * dt;
          if (e.x < 62) {
            e.x = 62;
            e.dir = 1;
          } else if (e.x > FIELD_W - 62) {
            e.x = FIELD_W - 62;
            e.dir = -1;
          }
          break;
        case "gunship":
          if (e.state === "enter") {
            e.y += e.vy * dt;
            if (e.y >= e.hoverY) e.state = "active";
          } else if (e.state === "active") {
            e.activeT += dt;
            e.x = e.baseX + Math.sin(e.t * 1.05) * Math.min(52, e.sway);
            if (e.activeT > 11) e.state = "leave";
          } else {
            e.y += 130 * dt;
          }
          break;
      }

      const onScreen = e.y > 30 && e.y < FIELD_H * 0.72;
      const canFire =
        e.state !== "enter" &&
        onScreen &&
        !(e.kind === "gunship" && e.state !== "active");
      if (canFire && e.fireT <= 0) {
        this.enemyFire(e);
        e.shots += 1;
        e.fireT =
          e.kind === "turret"
            ? 2.6
            : e.kind === "gunship"
              ? 2.2
              : e.kind === "heli"
                ? 2.0
                : rand(2.0, 2.8);
      }

      if (e.y > FIELD_H + 50 || e.x < -80 || e.x > FIELD_W + 80) e.dead = true;
    }
  }

  private enemyFire(e: Enemy): void {
    switch (e.kind) {
      case "drone":
        this.shootAimed(e.x, e.y + 12, 195, 0, 1, "#ff6f9d");
        if (e.shots % 5 === 4) this.shootFanDown(e.x, e.y + 10, 2, 0.24, 160, "#ff9db9");
        break;
      case "heli":
        this.shootAimed(e.x, e.y + 12, 175, 0.2, 2, "#ffa35e");
        if (e.shots % 4 === 3) this.shootFanDown(e.x, e.y + 16, 3, 0.22, 150, "#ffc37e");
        break;
      case "turret":
        this.shootAimed(e.x, e.y, 200, 0.15, 2, "#ffb35e");
        if (e.shots % 3 === 2) this.shootFanDown(e.x, e.y + 4, 2, 0.26, 170, "#ffd08a");
        break;
      case "tank":
        this.shootAimed(e.x, e.y, 215, 0.1, 2, "#ff7f9f");
        if (e.shots % 3 === 2) this.shootFanDown(e.x, e.y + 6, 3, 0.2, 175, "#ffb0c4");
        break;
      case "gunship": {
        const extra = e.elite ? 1 : 0;
        this.shootAimed(e.x, e.y + 18, 190, 0.18, 3 + extra, "#c77bff");
        if (e.elite) this.shootFanDown(e.x, e.y + 20, 5, 0.26, 155, "#e08bff");
        if (e.shots % 4 === 3) this.shootFanDown(e.x, e.y + 12, 3, 0.3, 140, "#b06bff");
        break;
      }
    }
  }

  private damageEnemy(e: Enemy, dmg: number): void {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 1;
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    this.addScore(e.score);
    const scale = e.elite ? 1.45 : 1;

    switch (e.kind) {
      case "drone":
        this.explode(e.x, e.y, 0.72 * scale, e.elite ? "#ffc46a" : "#ff8a5c");
        this.spawnRing(e.x, e.y, e.elite ? "#ffe0a0" : "#ffb080", 76 * scale, 0.3);
        this.spawnDebris(e.x, e.y, e.elite ? 8 : 4, e.elite ? "#c9964a" : "#8c3540");
        break;
      case "heli": {
        this.explode(e.x, e.y, 0.95 * scale, "#ffb066");
        this.spawnRing(e.x, e.y, "#ffd08a", 96 * scale, 0.34);
        // 旋翼与尾梁碎片横向甩出，和无人机的爆点区分开。
        for (let i = 0; i < (e.elite ? 10 : 6); i += 1) {
          this.particles.push({
            kind: "debris",
            x: e.x,
            y: e.y - 16,
            vx: rand(-220, 220),
            vy: rand(-90, 40),
            life: rand(0.5, 0.95),
            maxLife: 0.95,
            size: rand(3, 6),
            color: "#3d4a2c",
            rot: rand(0, Math.PI * 2),
            spin: rand(-16, 16),
          });
        }
        this.shake = Math.max(this.shake, 3 * scale);
        break;
      }
      case "turret":
        this.explode(e.x, e.y, 1.02 * scale, "#ffd27a");
        this.spawnRing(e.x, e.y, "#ffe7b0", 108 * scale, 0.36);
        this.spawnDebris(e.x, e.y, 7, "#3d4c42", 175);
        this.spawnSpark(e.x, e.y, "#fff0c0", 10);
        this.shake = Math.max(this.shake, 3.5 * scale);
        break;
      case "tank":
        this.explode(e.x, e.y, 1.28 * scale, "#ff9d5c");
        this.spawnRing(e.x, e.y, "#ffcf8a", 132 * scale, 0.4);
        this.spawnDebris(e.x, e.y, 10, "#2f372a", 200);
        this.spawnDebris(e.x, e.y, 4, "#72805f", 140);
        this.shake = Math.max(this.shake, 6 * scale);
        break;
      case "gunship": {
        this.explode(e.x, e.y, 1.5 * scale, "#ffbe6a");
        this.spawnRing(e.x, e.y, "#ffd9a0", 150 * scale, 0.42);
        this.spawnRing(e.x, e.y, "#9fe8ff", 96 * scale, 0.3);
        this.spawnDebris(e.x, e.y, e.elite ? 16 : 11, "#334145", 220);
        this.spawnDebris(e.x, e.y, 5, "#5a6d70", 150);
        this.shake = Math.max(this.shake, 8 * scale);
        this.flash = Math.max(this.flash, 0.06 * scale);
        break;
      }
    }

    if (e.kind === "gunship" || e.kind === "tank") {
      const count = e.kind === "gunship" ? (e.elite ? 3 : 2) : 1;
      for (let i = 0; i < count; i += 1) {
        this.blasts.push({
          x: e.x + rand(-26, 26),
          y: e.y + rand(-18, 18),
          delay: 0.14 + i * 0.13,
          power: e.kind === "gunship" ? 0.95 : 0.8,
          color: e.kind === "gunship" ? "#ffc46a" : "#ff9d5c",
        });
      }
    }

    if (this.explodeSfxT <= 0) {
      this.audio.play("explode");
      this.explodeSfxT = e.kind === "gunship" || e.kind === "tank" ? 0.13 : 0.07;
    }
    if (e.drop) this.spawnPowerUp(e.x, e.y, e.drop);
    // 精英怪随机掉落战利品（1~3 cr），和常规补给互不冲突。
    if (e.elite && Math.random() < 0.6) {
      this.spawnLoot(e.x, e.y, 1 + Math.floor(rand(0, 3)));
    }
    this.killCount += 1;
    if (this.killCount >= this.nextHealAt) {
      this.nextHealAt += HP_HEAL_KILLS;
      this.hp = PLAYER_MAX_HP;
      this.hurtInvuln = Math.max(this.hurtInvuln, 0.4);
      this.spawnRing(this.playerX, this.playerY, "#8effc4", 110, 0.5);
      this.toast(`击破 ${HP_HEAL_KILLS} 架 · 机体修复 HP 回满`);
      this.audio.play("powerup");
    }
    // 常规击破也保留少量补给机会，避免非精英波次完全没有成长。
    if (!e.drop && (this.killCount % 14 === 0 || Math.random() < 0.05)) {
      this.spawnPowerUp(e.x, e.y, rollSupplyDrop(this.weaponType, this.bombs < MAX_BOMBS));
    }
  }

  private spawnPowerUp(x: number, y: number, type: PowerType): void {
    if (this.powerups.length >= 8) this.powerups.shift();
    this.powerups.push({ x, y, vy: 78, t: rand(0, 3), type, value: 0, shuffle: 0 });
  }

  private spawnLoot(x: number, y: number, value: number): void {
    if (this.powerups.length >= 10) this.powerups.shift();
    this.powerups.push({ x, y, vy: 70, t: rand(0, 3), type: "C", value, shuffle: 0 });
  }

  private updatePowerups(dt: number): void {
    for (const p of this.powerups) {
      p.t += dt;
      p.shuffle = Math.max(0, p.shuffle - dt);
      p.y += p.vy * dt;
      p.x += Math.sin(p.t * 2.4) * 14 * dt;
    }
    this.powerups = this.powerups.filter((p) => p.y < FIELD_H + 30);
  }

  /** 被子弹打中的补给：随机换成另一种字母，让玩家能「先打再捡」挑想要的类型。 */
  private shufflePickup(p: PowerUp): void {
    if (p.type === "C") return;
    p.type = p.type === "B" ? randomBulletType() : randomBulletType(p.type);
    p.shuffle = 0.32;
    this.spawnSpark(p.x, p.y, WEAPONS[isBulletType(p.type) ? p.type : "W"].color, 3);
    if (this.shuffleSfxT <= 0) {
      this.audio.play("shuffle");
      this.shuffleSfxT = 0.06;
    }
  }

  private collectPowerUp(p: PowerUp): void {
    const index = this.powerups.indexOf(p);
    if (index >= 0) this.powerups.splice(index, 1);
    if (p.type === "C") {
      this.stageLoot += p.value;
      this.toast(`战利品 +${p.value} cr · 通关结算`);
      this.audio.play("coin");
      this.spawnSpark(p.x, p.y, "#ffd75e", 8);
      this.emitHud(true);
      return;
    }
    if (p.type === "B") {
      if (this.bombs < MAX_BOMBS) {
        this.bombs += 1;
        this.toast("炸弹补给 +1");
        this.audio.play("powerup");
      } else {
        this.addScore(1000);
        this.audio.play("coin");
      }
      this.emitHud(true);
      return;
    }
    this.applyWeaponPickup(p.type);
    this.emitHud(true);
  }

  /**
   * 武器补给的核心规则：不同字母清空等级并切换，相同字母升一级。
   * 满级后再吃同字母不涨等级，折算成分数，避免补给白白消失。
   */
  private applyWeaponPickup(type: BulletType): void {
    const label = `${WEAPONS[type].name} ${type}`;
    if (type !== this.weaponType) {
      const lost = this.weaponLevel > 1 ? ` · 原 ${WEAPONS[this.weaponType].name} Lv${this.weaponLevel} 清空` : "";
      this.weaponType = type;
      this.weaponLevel = 1;
      this.fireCooldown = Math.min(this.fireCooldown, 0.08);
      this.toast(`切换 ${label} · Lv1${lost}`);
      this.audio.play("powerup");
      this.spawnRing(this.playerX, this.playerY, WEAPONS[type].color, 96, 0.4);
      return;
    }
    if (this.weaponLevel < MAX_WEAPON_LEVEL) {
      this.weaponLevel += 1;
      this.toast(`${label} 提升 · Lv${this.weaponLevel}`);
      this.audio.play("powerup");
      return;
    }
    this.addScore(MAX_LEVEL_SCORE);
    this.toast(`${label} 已满级 · +${MAX_LEVEL_SCORE}`);
    this.audio.play("coin");
  }

  /* ----------------------------- 障碍物 ----------------------------- */

  private updateObstacles(dt: number): void {
    if (!this.boss && this.stageTime < this.def.bossAt - 5) {
      this.obstacleTimer -= dt;
      if (this.obstacleTimer <= 0) {
        this.spawnObstacle();
        this.obstacleTimer = rand(4.6, 6.8);
      }
    }

    for (const o of this.obstacles) {
      o.t += dt;
      o.y += (this.def.groundSpeed + 26) * dt;
      if (o.kind === "mine" || o.kind === "asteroid") {
        o.x += Math.sin(o.t * 1.4 + o.drift) * 14 * dt;
      }
      o.flash = Math.max(0, o.flash - dt * 3.2);
      if (o.hp < o.maxHp * 0.45 && Math.random() < dt * 6) {
        this.particles.push({
          kind: "smoke",
          x: o.x + rand(-o.r * 0.4, o.r * 0.4),
          y: o.y - o.r * 0.4,
          vx: rand(-12, 12),
          vy: rand(-34, -14),
          life: rand(0.35, 0.7),
          maxLife: 0.7,
          size: rand(4, 8),
          color: "#53504c",
        });
      }
    }
    this.obstacles = this.obstacles.filter((o) => !o.dead && o.y < FIELD_H + 50);
  }

  private spawnObstacle(): void {
    const kind: ObstacleKind =
      this.stage === 1
        ? Math.random() < 0.55
          ? "mine"
          : "barrier"
        : this.stage === 2
          ? Math.random() < 0.5
            ? "barricade"
            : "container"
          : this.stage === 3 || this.stage === 4
            ? Math.random() < 0.55
              ? "asteroid"
              : "debris"
            : Math.random() < 0.5
              ? "container"
              : "debris";
    const stats: Record<ObstacleKind, { r: number; hp: number; score: number }> = {
      mine: { r: 13, hp: 16, score: 400 },
      barrier: { r: 23, hp: 52, score: 800 },
      barricade: { r: 22, hp: 60, score: 800 },
      container: { r: 24, hp: 88, score: 1100 },
      asteroid: { r: 23, hp: 100, score: 1100 },
      debris: { r: 16, hp: 44, score: 550 },
    };
    const base = stats[kind];
    // 后期关卡的残骸更耐打，靠数值而不是新模型拉开难度。
    const tough = this.stage >= 4 ? (this.stage === 5 ? 1.35 : 1.15) : 1;
    const hp = Math.round(base.hp * tough);
    const x = rand(52, FIELD_W - 52);
    const push = (px: number, py: number) => {
      this.obstacles.push({
        kind,
        x: clamp(px, 40, FIELD_W - 40),
        y: py,
        r: base.r,
        hp,
        maxHp: hp,
        score: Math.round(base.score * tough),
        t: rand(0, 3),
        drift: rand(0, Math.PI * 2),
        flash: 0,
        dead: false,
      });
    };
    push(x, -42);
    // 少量双障碍制造需要走位的缺口，但不会封死整条航道。
    if (Math.random() < 0.3) {
      push(x + (x < FIELD_W / 2 ? rand(96, 150) : -rand(96, 150)), -76);
    }
  }

  private damageObstacle(o: Obstacle, dmg: number): void {
    if (o.dead) return;
    o.hp -= dmg;
    o.flash = 1;
    if (o.hp <= 0) this.destroyObstacle(o, true);
  }

  private destroyObstacle(o: Obstacle, award: boolean): void {
    if (o.dead) return;
    o.dead = true;
    if (award) {
      this.addScore(o.score);
      if (this.explodeSfxT <= 0) {
        this.audio.play("explode");
        this.explodeSfxT = 0.07;
      }
      this.rollObstacleDrop(o);
    }
    this.explode(o.x, o.y, o.kind === "asteroid" ? 1.1 : 0.85, o.kind === "asteroid" ? "#d8c19a" : "#ff9d5c");
    this.spawnRing(o.x, o.y, o.kind === "asteroid" ? "#d8c19a" : "#ffd9a0", o.r * 4, 0.3);
  }

  private rollObstacleDrop(o: Obstacle): void {
    if (Math.random() > 0.2) return;
    this.spawnPowerUp(o.x, o.y, rollSupplyDrop(this.weaponType, this.bombs < MAX_BOMBS));
  }

  /* ----------------------------- Boss ----------------------------- */

  private spawnBoss(): void {
    const hp = this.def.boss.hp;
    this.boss = {
      stage: this.def.no,
      x: FIELD_W / 2,
      y: 150,
      hp,
      maxHp: hp,
      t: 0,
      phase: 1,
      flash: 0,
      dying: null,
      fireA: 1.2,
      fireB: 2.2,
      fireC: 3.6,
      spiralT: 0,
      ringAngle: 0,
      auxT: this.def.no === 1 ? 5.5 : 2.4,
      spin: 0,
      trail: [],
      segments: [],
      beams: [],
    };
    this.audio.play("warning");
    this.toast("WARNING · BOSS APPROACHING");
    this.shake = Math.max(this.shake, 6);
    this.emitHud(true);
  }

  private updateBoss(dt: number): void {
    const b = this.boss;
    if (!b) return;
    b.t += dt;
    b.flash = Math.max(0, b.flash - dt * 5);

    if (b.dying !== null) {
      b.dying -= dt;
      if (Math.random() < dt * 26) {
        this.explode(b.x + rand(-110, 110), b.y + rand(-60, 60), rand(0.5, 1.3), "#ffbe6a");
      }
      if (b.dying <= 0) {
        this.boss = null;
        this.triggerStageClear();
      }
      return;
    }

    const frac = b.hp / b.maxHp;
    const nextPhase = frac < 0.33 ? 3 : frac < 0.66 ? 2 : 1;
    if (nextPhase > b.phase) {
      b.phase = nextPhase;
      this.flash = Math.max(this.flash, 0.22);
      this.shake = Math.max(this.shake, 8);
      this.audio.play("warning");
      this.toast(`BOSS 进入第 ${nextPhase} 阶段`);
    } else {
      b.phase = nextPhase;
    }

    if (frac < 0.62 && Math.random() < dt * (frac < 0.3 ? 16 : 8)) {
      const sx = b.stage === 2 && b.segments.length > 1
        ? b.segments[1 + Math.floor(Math.random() * (b.segments.length - 1))].x
        : b.x + rand(-70, 70);
      const sy = b.stage === 2 && b.segments.length > 1
        ? b.segments[1 + Math.floor(Math.random() * (b.segments.length - 1))].y
        : b.y + rand(-24, 34);
      this.particles.push({
        kind: "smoke",
        x: sx,
        y: sy,
        vx: rand(-14, 14),
        vy: rand(-8, 26),
        life: rand(0.35, 0.75),
        maxLife: 0.75,
        size: rand(5, 12),
        color: Math.random() < 0.3 ? "#ff7a4d" : "#5b5b62",
      });
    }

    if (b.stage === 1) this.updateCarrier(b, dt);
    else if (b.stage === 2) this.updateCentipede(b, dt);
    else if (b.stage === 3) this.updateCore(b, dt);
    else if (b.stage === 4) this.updateMassDriver(b, dt);
    else this.updateOmega(b, dt);
  }

  private updateCarrier(b: BossState, dt: number): void {
    b.x = FIELD_W / 2 + Math.sin(b.t * 0.5) * 118;
    b.y = 138 + Math.sin(b.t * 1.35) * 12;

    b.fireA -= dt;
    if (b.fireA <= 0) {
      this.shootAimed(b.x - 82, b.y + 18, 195, 0, 1, "#ff6f9d");
      this.shootAimed(b.x + 82, b.y + 18, 195, 0, 1, "#ff6f9d");
      b.fireA = b.phase >= 3 ? 1.4 : 1.9;
    }
    b.fireB -= dt;
    if (b.fireB <= 0) {
      this.shootFanDown(b.x, b.y + 34, 7 + b.phase, 0.18, 155, "#ff9d5c");
      b.fireB = b.phase >= 3 ? 3.0 : 3.8;
    }
    b.fireC -= dt;
    if (b.phase >= 2 && b.fireC <= 0) {
      this.shootRing(b.x, b.y + 10, 12 + b.phase, 110, b.t * 1.4, "#ff7ac8");
      b.fireC = b.phase >= 3 ? 3.6 : 4.6;
    }
    b.auxT -= dt;
    if (b.phase >= 2 && b.auxT <= 0) {
      this.launchEscorts(b);
      b.auxT = b.phase >= 3 ? 8 : 11;
    }
  }

  private launchEscorts(b: BossState): void {
    this.audio.play("warning");
    this.toast("空母释放护航机");
    for (const side of [-1, 1]) {
      const x = clamp(b.x + side * 92, 42, FIELD_W - 42);
      this.enemies.push({
        kind: "drone",
        x,
        y: b.y + 26,
        baseX: x,
        vy: 132,
        vx: 0,
        hp: 26,
        maxHp: 26,
        r: 13,
        score: 220,
        t: rand(0, 3),
        fireT: 0.9,
        shots: 0,
        sway: 42,
        seed: rand(0, Math.PI * 2),
        hoverY: 0,
        activeT: 0,
        state: "active",
        elite: false,
        drop: null,
        dir: 1,
        flash: 0,
        dead: false,
      });
    }
  }

  private updateCentipede(b: BossState, dt: number): void {
    b.x = FIELD_W / 2 + Math.sin(b.t * 0.55) * 150;
    b.y = 140 + Math.sin(b.t * 1.2) * 22;
    this.updateTrail(b);

    b.fireA -= dt;
    if (b.fireA <= 0) {
      const seg = b.segments[1 + Math.floor(Math.random() * Math.max(1, b.segments.length - 2))] ?? b;
      this.shootAimed(seg.x, seg.y, 195, 0.13, 2, "#d47bff");
      b.fireA = b.phase >= 3 ? 1.15 : 1.55;
    }
    b.fireB -= dt;
    if (b.fireB <= 0) {
      this.shootRing(b.x, b.y, b.phase >= 2 ? 16 : 12, 122, b.t, "#ff7ac8");
      b.fireB = b.phase >= 3 ? 3.2 : 4.2;
    }
    b.fireC -= dt;
    if (b.phase >= 3 && b.fireC <= 0) {
      this.shootFanDown(b.x, b.y + 20, 9, 0.22, 145, "#ffb35e");
      b.fireC = 2.4;
    }
    b.auxT -= dt;
    if (b.phase >= 2 && b.auxT <= 0) {
      const tail = b.segments[b.segments.length - 1] ?? b;
      this.shootAimed(tail.x, tail.y + 12, 195, 0.1, 2, "#ff9ad8");
      this.shootFanDown(tail.x, tail.y + 14, 5 + b.phase, 0.26, 155, "#e08bff");
      b.auxT = b.phase >= 3 ? 5.6 : 7.4;
    }
  }

  private updateCore(b: BossState, dt: number): void {
    b.x = FIELD_W / 2 + Math.sin(b.t * 0.35) * 70;
    b.y = 146 + Math.sin(b.t * 0.9) * 10;
    b.ringAngle += dt * 1.4;

    b.fireA -= dt;
    if (b.fireA <= 0) {
      this.shootRing(b.x, b.y, 16, 128, b.t * 0.9, "#8fd3ff");
      b.fireA = b.phase >= 2 ? 2.3 : 3.0;
    }
    b.fireB -= dt;
    if (b.fireB <= 0) {
      this.shootAimed(b.x, b.y + 16, 210, 0.12, 2, "#ff7ac8");
      b.fireB = b.phase >= 3 ? 1.4 : 2.0;
    }
    b.fireC -= dt;
    if (b.phase >= 2 && b.fireC <= 0) {
      this.spawnBeams(b);
      b.fireC = b.phase >= 3 ? 4.6 : 6.2;
    }
    if (b.phase >= 3) {
      b.spiralT -= dt;
      if (b.spiralT <= 0) {
        b.spiralT = 0.16;
        const base = b.t * 4.4;
        for (const offset of [0, Math.PI]) {
          const angle = base + offset;
          this.enemyBullets.push({
            x: b.x,
            y: b.y,
            vx: Math.cos(angle) * 120,
            vy: Math.sin(angle) * 120,
            r: 4,
            color: "#9fe8ff",
            dead: false,
          });
        }
      }
    }

    b.auxT -= dt;
    if (b.auxT <= 0) {
      for (let i = 0; i < 6; i += 1) {
        const angle = b.ringAngle + (i * Math.PI) / 3;
        this.shootAimed(
          b.x + Math.cos(angle) * 74,
          b.y + Math.sin(angle) * 74,
          195,
          0.1,
          2,
          "#9fe8ff",
        );
      }
      this.audio.play("warning");
      b.auxT = b.phase >= 3 ? 8 : 11;
    }

    this.updateBeams(b, dt);
  }

  /** 「猎户座」质量投射器：轨道炮直射 + 电磁弹扇形 + 月面无人机。 */
  private updateMassDriver(b: BossState, dt: number): void {
    b.x = FIELD_W / 2 + Math.sin(b.t * 0.42) * 128;
    b.y = 142 + Math.sin(b.t * 1.05) * 14;
    b.spin += dt * 0.9;
    b.ringAngle += dt * 0.7;

    b.fireA -= dt;
    if (b.fireA <= 0) {
      // 主炮充能完成后沿炮口方向连射三发高速直射弹。
      this.shootAimed(b.x, b.y + 42, 300, 0.04, 3, "#ffe27a");
      if (b.phase >= 2) this.shootAimed(b.x - 92, b.y + 8, 230, 0.09, 2, "#ffb15e");
      b.fireA = b.phase >= 3 ? 1.5 : 2.2;
    }
    b.fireB -= dt;
    if (b.fireB <= 0) {
      this.shootFanDown(b.x, b.y + 30, 8 + b.phase * 2, 0.2, 168, "#ffd06a");
      b.fireB = b.phase >= 3 ? 2.6 : 3.6;
    }
    b.fireC -= dt;
    if (b.phase >= 2 && b.fireC <= 0) {
      this.shootRing(b.x, b.y + 6, 14 + b.phase, 118, b.spin, "#ff9d5c");
      b.fireC = b.phase >= 3 ? 3.4 : 4.8;
    }
    b.auxT -= dt;
    if (b.auxT <= 0) {
      if (b.phase >= 2) {
        this.spawnBeamsSweep(b, b.phase >= 3 ? 3 : 2);
      } else {
        this.spawnBeams(b);
      }
      this.summonMinions(b, b.phase >= 3 ? 3 : 2);
      b.auxT = b.phase >= 3 ? 6.4 : 8.6;
    }

    if (b.phase >= 3) {
      b.spiralT -= dt;
      if (b.spiralT <= 0) {
        b.spiralT = 0.14;
        const base = -b.spin * 2.6;
        for (const offset of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
          const angle = base + offset;
          this.enemyBullets.push({
            x: b.x,
            y: b.y + 20,
            vx: Math.cos(angle) * 138,
            vy: Math.sin(angle) * 138,
            r: 4,
            color: "#ffe27a",
            dead: false,
          });
        }
      }
    }

    this.updateBeams(b, dt);
  }

  /** 天穹要塞「欧米伽」：浮游炮环 + 双重激光 + 追踪蜂群，最后阶段的复合弹幕。 */
  private updateOmega(b: BossState, dt: number): void {
    b.x = FIELD_W / 2 + Math.sin(b.t * 0.3) * 96;
    b.y = 138 + Math.sin(b.t * 0.78) * 18;
    b.ringAngle += dt * 1.15;
    b.spin -= dt * 0.55;

    b.fireA -= dt;
    if (b.fireA <= 0) {
      this.shootRing(b.x, b.y, 18 + b.phase * 2, 132, b.ringAngle, "#b98cff");
      this.shootRing(b.x, b.y, 12, 96, -b.spin, "#7fe3ff");
      b.fireA = b.phase >= 2 ? 2.4 : 3.2;
    }
    b.fireB -= dt;
    if (b.fireB <= 0) {
      for (let i = 0; i < 8; i += 1) {
        const angle = b.ringAngle + (i * Math.PI) / 4;
        this.shootAimed(b.x + Math.cos(angle) * 86, b.y + Math.sin(angle) * 86, 215, 0.1, 2, "#ff8fd0");
      }
      b.fireB = b.phase >= 3 ? 2.2 : 3.0;
    }
    b.fireC -= dt;
    if (b.phase >= 2 && b.fireC <= 0) {
      this.spawnBeamsSweep(b, b.phase >= 3 ? 3 : 2);
      b.fireC = b.phase >= 3 ? 4.2 : 5.8;
    }

    b.auxT -= dt;
    if (b.auxT <= 0) {
      this.spawnHomingSwarm(b, b.phase >= 3 ? 5 : 3);
      this.summonMinions(b, b.phase >= 3 ? 2 : 1);
      this.audio.play("warning");
      b.auxT = b.phase >= 3 ? 7.2 : 9.6;
    }

    if (b.phase >= 3) {
      b.spiralT -= dt;
      if (b.spiralT <= 0) {
        b.spiralT = 0.12;
        const base = b.ringAngle * 3.2;
        for (const offset of [0, Math.PI]) {
          const angle = base + offset;
          this.enemyBullets.push({
            x: b.x,
            y: b.y,
            vx: Math.cos(angle) * 126,
            vy: Math.sin(angle) * 126,
            r: 4,
            color: "#d9b6ff",
            dead: false,
          });
        }
      }
    }

    this.updateBeams(b, dt);
  }

  private updateBeams(b: BossState, dt: number): void {
    for (const beam of b.beams) {
      if (beam.warn > 0) {
        beam.warn -= dt;
        if (beam.warn <= 0) {
          beam.active = 0.7;
          this.audio.play("beam");
          this.shake = Math.max(this.shake, 7);
        }
      } else {
        beam.active -= dt;
        if (
          beam.active > 0 &&
          !beam.hit &&
          this.invincible <= 0 &&
          this.hurtInvuln <= 0 &&
          this.respawn <= 0 &&
          Math.abs(this.playerX - beam.x) < 15
        ) {
          beam.hit = true;
          this.damagePlayer(34);
        }
      }
    }
    b.beams = b.beams.filter((beam) => beam.warn > 0 || beam.active > 0);
  }

  /** 多条竖直光束排成一道带缺口的墙，预警更长、缺口必须可走。 */
  private spawnBeamsSweep(b: BossState, count: number): void {
    const target = clamp(this.playerX, 70, FIELD_W - 70);
    const step = 124;
    const xs = new Set<number>();
    for (let i = 0; i < count; i += 1) {
      const slot = i - Math.floor((count - 1) / 2);
      xs.add(Math.round(clamp(target + slot * step, 46, FIELD_W - 46)));
    }
    // 玩家所在列一定不开火，留出躲藏位。
    for (const x of xs) {
      if (Math.abs(x - target) < step * 0.6) continue;
      b.beams.push({ x, warn: 1.35, active: 0, hit: false });
    }
  }

  /** Boss 在自身两侧召唤杂兵，进场位置就在战场内，不会从顶部落下叠加压力。 */
  private summonMinions(b: BossState, count: number): void {
    this.audio.play("warning");
    this.toast("Boss 释放护卫单位");
    for (let i = 0; i < count; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = clamp(b.x + side * rand(96, 150), 42, FIELD_W - 42);
      this.spawnEnemy({ at: 0, kind: "heli", x }, Math.min(b.y + 40, FIELD_H - 220));
    }
  }

  /** 从炮位射出的低速瞄准弹群：慢所以可绕，密所以要走位。 */
  private spawnHomingSwarm(b: BossState, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const angle = b.ringAngle + (i * Math.PI * 2) / count;
      this.shootAimed(b.x + Math.cos(angle) * 70, b.y + Math.sin(angle) * 70, 96, 0.26, 3, "#c9a3ff");
    }
  }

  private updateTrail(b: BossState): void {
    const last = b.trail[0];
    if (!last || distance(last.x, last.y, b.x, b.y) > 3.5) {
      b.trail.unshift({ x: b.x, y: b.y });
      if (b.trail.length > 150) b.trail.pop();
    }
    b.segments = [];
    for (let i = 0; i < 9; i += 1) {
      const idx = Math.min(i * 7, b.trail.length - 1);
      b.segments.push(b.trail[idx] ?? { x: b.x, y: b.y });
    }
  }

  private spawnBeams(b: BossState): void {
    const target = clamp(this.playerX, 60, FIELD_W - 60);
    const xs = [target];
    const mirror = FIELD_W - target;
    if (Math.abs(mirror - target) > 40) xs.push(mirror);
    for (const x of xs) b.beams.push({ x, warn: 1.15, active: 0, hit: false });
  }

  /** Boss 沿弹道方向的半宽：激光穿过整个躯体只算一发。 */
  private bossLaserSpan(): number {
    const b = this.boss;
    if (!b) return 46;
    if (b.stage === 1) return 116;
    if (b.stage === 2) return 34;
    if (b.stage === 4) return 104;
    if (b.stage === 5) return 58;
    return 46;
  }

  private laserGap(bullet: PlayerBullet, span: number): number {
    const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
    return Math.max(0.05, (span * 2) / speed);
  }

  private bossHitTest(x: number, y: number, r: number): boolean {
    const b = this.boss;
    if (!b || b.dying !== null) return false;
    if (b.stage === 2) {
      if (distance(x, y, b.x, b.y) < 34 + r) return true;
      return b.segments.some((seg, i) => i > 0 && distance(x, y, seg.x, seg.y) < 20 + r);
    }
    if (b.stage === 1) return Math.abs(x - b.x) < 116 + r && Math.abs(y - b.y) < 46 + r;
    if (b.stage === 4) return Math.abs(x - b.x) < 104 + r && Math.abs(y - b.y) < 52 + r;
    if (b.stage === 5) {
      if (distance(x, y, b.x, b.y) < 52 + r) return true;
      return this.bossPodPoints(b).some((p) => distance(x, y, p.x, p.y) < 15 + r);
    }
    return distance(x, y, b.x, b.y) < 46 + r;
  }

  /** 要塞 5 的六座浮游炮坐标，命中判定与绘制共用。 */
  private bossPodPoints(b: BossState): { x: number; y: number }[] {
    const list: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i += 1) {
      const a = b.ringAngle * 0.5 + (i * Math.PI) / 3;
      list.push({ x: b.x + Math.cos(a) * 92, y: b.y + Math.sin(a) * 92 });
    }
    return list;
  }

  private damageBoss(dmg: number): void {
    const b = this.boss;
    if (!b || b.dying !== null) return;
    b.hp -= dmg;
    b.flash = 1;
    if (b.hp <= 0) {
      b.hp = 0;
      b.dying = 2.4;
      b.beams = [];
      this.addScore(this.def.boss.score);
      this.audio.play("bigExplode");
      this.shake = Math.max(this.shake, 22);
      this.flash = Math.max(this.flash, 0.5);
      for (const bullet of this.enemyBullets) bullet.dead = true;
      // Boss 必掉一箱战利品；结算前没捡到的会在通关瞬间自动回收。
      for (let i = 0; i < 4; i += 1) {
        this.spawnLoot(b.x + rand(-80, 80), b.y + rand(-16, 26), 2 + Math.floor(rand(0, 3)));
      }
      this.emitHud(true);
    }
  }

  private triggerStageClear(): void {
    if (this.stageClearFired) return;
    this.stageClearFired = true;
    this.state = "stageclear";
    this.addScore(10000);
    this.enemyBullets = [];
    for (const p of this.powerups) {
      if (p.type === "C") this.stageLoot += p.value;
    }
    this.powerups = [];
    this.audio.play("stageClear");
    this.emitHud(true);
    this.cb.onStageClear({
      stage: this.stage,
      stageScore: this.stageScore,
      totalScore: this.score,
      durationMs: Math.round(this.stageTime * 1000),
      loot: this.stageLoot,
    });
  }

  /* ----------------------------- 弹幕与碰撞 ----------------------------- */

  private shootAimed(
    x: number,
    y: number,
    speed: number,
    spread: number,
    count: number,
    color: string,
  ): void {
    const base = Math.atan2(this.playerY - y, this.playerX - x);
    for (let i = 0; i < count; i += 1) {
      const angle = base + (i - (count - 1) / 2) * spread;
      this.enemyBullets.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: ENEMY_BULLET_R,
        color,
        dead: false,
      });
    }
  }

  private shootFanDown(
    x: number,
    y: number,
    count: number,
    spread: number,
    speed: number,
    color: string,
  ): void {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.PI / 2 + (i - (count - 1) / 2) * spread;
      this.enemyBullets.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: ENEMY_BULLET_R,
        color,
        dead: false,
      });
    }
  }

  private shootRing(x: number, y: number, count: number, speed: number, offset: number, color: string): void {
    for (let i = 0; i < count; i += 1) {
      const angle = offset + (i * Math.PI * 2) / count;
      this.enemyBullets.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: ENEMY_BULLET_R,
        color,
        dead: false,
      });
    }
  }

  private updateBullets(dt: number): void {
    for (const b of this.bullets) {
      if (b.dead) continue;
      b.hitGap = Math.max(0, b.hitGap - dt);
      if (b.kind === "missile") {
        b.ttl -= dt;
        const target = this.nearestTarget(b.x, b.y);
        if (target) {
          const speed = Math.hypot(b.vx, b.vy);
          const current = Math.atan2(b.vy, b.vx);
          const desired = Math.atan2(target.y - b.y, target.x - b.x);
          const diff = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
          const turn = clamp(diff, -7.5 * dt, 7.5 * dt);
          const next = current + turn;
          b.vx = Math.cos(next) * speed;
          b.vy = Math.sin(next) * speed;
        }
        if (Math.random() < dt * 26) {
          this.particles.push({
            kind: "smoke",
            x: b.x - b.vx * 0.01,
            y: b.y - b.vy * 0.01,
            vx: rand(-12, 12),
            vy: 60 + rand(0, 30),
            life: 0.24,
            maxLife: 0.24,
            size: 3.2,
            color: "#ffb066",
          });
        }
        // 导弹没追上目标就自爆，仍然造成一次溅射。
        if (b.ttl <= 0) {
          b.dead = true;
          this.detonate(b);
        }
      }
      if (b.kind === "shell") {
        b.ttl -= dt;
        if (b.ttl <= 0) {
          b.dead = true;
          this.detonate(b);
        }
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -30 || b.x < -30 || b.x > FIELD_W + 30) b.dead = true;
    }
    for (const b of this.enemyBullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -30 || b.y > FIELD_H + 30 || b.x < -30 || b.x > FIELD_W + 30) b.dead = true;
    }
  }

  private nearestTarget(x: number, y: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = distance(x, y, e.x, e.y);
      if (d < bestD) {
        bestD = d;
        best = { x: e.x, y: e.y };
      }
    }
    const boss = this.boss;
    if (boss && boss.dying === null) {
      const points =
        boss.stage === 2 && boss.segments.length > 0
          ? boss.segments.filter((_, i) => i > 0)
          : [{ x: boss.x, y: boss.y }];
      for (const point of points) {
        const d = distance(x, y, point.x, point.y);
        if (d < bestD) {
          bestD = d;
          best = { x: point.x, y: point.y };
        }
      }
    }
    return best;
  }

  /**
   * 一次命中的统一收尾：非穿透弹立刻消失，激光按剩余穿透次数递减；
   * 带溅射半径的弹种（导弹 / 榴弹）在落点再补一次范围伤害。
   */
  private impact(
    bullet: PlayerBullet,
    hit: () => void,
    opts: { skip?: { x: number; y: number }; bossBody?: boolean; span?: number } = {},
  ): void {
    if (bullet.kind === "laser") {
      if (bullet.hitGap > 0) return;
      // 冷却按目标沿弹道方向的尺寸换算：同一个目标穿过去只算一发，
      // 但编队里前后两架小机仍然能各吃一发。
      bullet.hitGap = this.laserGap(bullet, opts.span ?? 24);
      // Boss 是一个整体：一次穿过只算一发，不扣穿透次数。
      if (!opts.bossBody) {
        bullet.pierce -= 1;
        if (bullet.pierce < 0) bullet.dead = true;
      }
    } else {
      bullet.dead = true;
    }
    this.spawnSpark(
      bullet.x,
      bullet.y,
      WEAPONS[bullet.weapon].color,
      bullet.kind === "missile" || bullet.kind === "shell" ? 6 : 3,
    );
    hit();
    if (bullet.blastR > 0) this.detonate(bullet, opts.skip);
    if (bullet.kind !== "cannon" && this.explodeSfxT <= 0) {
      this.audio.play("hit");
      this.explodeSfxT = 0.05;
    }
  }

  /** 导弹 / 榴弹的落点爆炸：半径内的敌机、障碍与 Boss 都会吃到溅射。 */
  private detonate(bullet: PlayerBullet, skip?: { x: number; y: number }): void {
    if (bullet.blastR <= 0) return;
    this.explode(bullet.x, bullet.y, bullet.kind === "shell" ? 0.42 : 0.28, bullet.kind === "shell" ? "#ff8f6a" : "#ffb066");
    const splash = bullet.dmg * (bullet.kind === "shell" ? 0.55 : 0.4);
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (skip && distance(e.x, e.y, skip.x, skip.y) < 1) continue;
      if (distance(e.x, e.y, bullet.x, bullet.y) < bullet.blastR + e.r) this.damageEnemy(e, splash);
    }
    for (const o of this.obstacles) {
      if (o.dead) continue;
      if (skip && distance(o.x, o.y, skip.x, skip.y) < 1) continue;
      if (distance(o.x, o.y, bullet.x, bullet.y) < bullet.blastR + o.r) this.damageObstacle(o, splash);
    }
    if (this.boss && this.bossHitTest(bullet.x, bullet.y, bullet.blastR)) this.damageBoss(splash);
  }

  private resolveCollisions(): void {
    // 自机子弹 → 敌机
    for (const bullet of this.bullets) {
      if (bullet.dead) continue;

      // 先撞上补给：打一下就随机改写它的字母，这是「凑同一种类型刷等级」的核心操作。
      for (const p of this.powerups) {
        if (p.type === "C") continue;
        if (bullet.kind === "laser" && bullet.hitGap > 0) break;
        if (distance(bullet.x, bullet.y, p.x, p.y) < PICKUP_R + bullet.r) {
          this.shufflePickup(p);
          if (bullet.kind === "laser") bullet.hitGap = this.laserGap(bullet, PICKUP_R);
          else bullet.dead = true;
          break;
        }
      }
      if (bullet.dead) continue;

      for (const e of this.enemies) {
        if (e.dead) continue;
        if (distance(bullet.x, bullet.y, e.x, e.y) < e.r + bullet.r) {
          this.impact(bullet, () => this.damageEnemy(e, bullet.dmg), { skip: e, span: e.r });
          break;
        }
      }
      if (bullet.dead) continue;

      for (const o of this.obstacles) {
        if (o.dead) continue;
        if (distance(bullet.x, bullet.y, o.x, o.y) < o.r + bullet.r) {
          this.impact(bullet, () => this.damageObstacle(o, bullet.dmg), { skip: o, span: o.r });
          break;
        }
      }
      if (bullet.dead) continue;

      if (this.bossHitTest(bullet.x, bullet.y, bullet.r)) {
        this.boss!.flash = 1;
        this.impact(bullet, () => this.damageBoss(bullet.dmg), {
          bossBody: true,
          span: this.bossLaserSpan(),
        });
      }
    }

    if (this.state !== "playing" || this.paused) return;

    // 敌弹 → 自机：扣 10 HP，不再一击坠机
    if (this.invincible <= 0 && this.hurtInvuln <= 0 && this.respawn <= 0) {
      for (const b of this.enemyBullets) {
        if (b.dead) continue;
        if (distance(b.x, b.y, this.playerX, this.playerY) < PLAYER_R + b.r * 0.8) {
          b.dead = true;
          this.damagePlayer(10);
          break;
        }
      }
    }

    // 机体碰撞 → 自机
    if (this.state === "playing" && this.invincible <= 0 && this.hurtInvuln <= 0 && this.respawn <= 0) {
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (distance(e.x, e.y, this.playerX, this.playerY) < e.r + 12) {
          this.damagePlayer(e.kind === "gunship" || e.kind === "tank" ? 50 : 38);
          this.damageEnemy(e, 999);
          break;
        }
      }
      for (const o of this.obstacles) {
        if (o.dead) continue;
        if (distance(o.x, o.y, this.playerX, this.playerY) < o.r + 10) {
          this.damagePlayer(34);
          this.destroyObstacle(o, false);
          break;
        }
      }
      const boss = this.boss;
      if (boss && boss.dying === null) {
        const bodyR = boss.stage === 1 ? 60 : boss.stage === 4 ? 62 : boss.stage === 5 ? 56 : 40;
        const hitHead = distance(boss.x, boss.y, this.playerX, this.playerY) < bodyR;
        const hitSeg =
          boss.stage === 2 &&
          boss.segments.some((seg, i) => i > 0 && distance(seg.x, seg.y, this.playerX, this.playerY) < 34);
        const hitPod =
          boss.stage === 5 &&
          this.bossPodPoints(boss).some((p) => distance(p.x, p.y, this.playerX, this.playerY) < 26);
        if (hitHead || hitSeg || hitPod) this.damagePlayer(50);
      }
    }

    // 补给 → 自机
    if (this.respawn <= 0) {
      for (const p of [...this.powerups]) {
        if (distance(p.x, p.y, this.playerX, this.playerY) < 26) this.collectPowerUp(p);
      }
    }
  }

  private addScore(amount: number): void {
    const value = Math.max(0, Math.round(amount));
    this.score += value;
    this.stageScore += value;
  }

  /* ----------------------------- 特效 ----------------------------- */

  /** 大型目标的连爆：主爆之后补几团延时火光。 */
  private updateDeferredBlasts(dt: number): void {
    for (let i = this.blasts.length - 1; i >= 0; i -= 1) {
      const b = this.blasts[i];
      b.delay -= dt;
      if (b.delay <= 0) {
        this.explode(b.x, b.y, b.power, b.color);
        this.blasts.splice(i, 1);
      }
    }
  }

  private explode(x: number, y: number, power: number, color: string): void {
    const sparks = Math.round(8 + power * 10);
    for (let i = 0; i < sparks; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(40, 240) * power;
      this.particles.push({
        kind: "spark",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: rand(0.25, 0.6) * Math.sqrt(power),
        maxLife: 0.6,
        size: rand(1.6, 3.6) * power,
        color: Math.random() < 0.35 ? "#ffffff" : color,
      });
    }
    for (let i = 0; i < 4 + power * 3; i += 1) {
      this.particles.push({
        kind: "smoke",
        x: x + rand(-10, 10),
        y: y + rand(-10, 10),
        vx: rand(-26, 26),
        vy: rand(-26, 26),
        life: rand(0.4, 0.9),
        maxLife: 0.9,
        size: rand(8, 20) * power,
        color: Math.random() < 0.45 ? color : Math.random() < 0.5 ? "#ffb066" : "#6b625f",
      });
    }
    this.spawnRing(x, y, color, 90 * power, 0.35);
  }

  private spawnSpark(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i += 1) {
      this.particles.push({
        kind: "spark",
        x,
        y,
        vx: rand(-90, 90),
        vy: rand(-90, 90),
        life: rand(0.12, 0.3),
        maxLife: 0.3,
        size: rand(1.2, 2.4),
        color,
      });
    }
  }

  private spawnRing(x: number, y: number, color: string, size: number, life: number): void {
    this.particles.push({
      kind: "ring",
      x,
      y,
      vx: 0,
      vy: 0,
      life,
      maxLife: life,
      size,
      color,
    });
  }

  /** 爆散残骸：带自旋的小金属片，受重力下坠。 */
  private spawnDebris(x: number, y: number, count: number, color: string, spread = 160): void {
    for (let i = 0; i < count; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(30, spread);
      this.particles.push({
        kind: "debris",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - rand(10, 60),
        life: rand(0.55, 1.2),
        maxLife: 1.2,
        size: rand(1.8, 4.8),
        color,
        rot: rand(0, Math.PI * 2),
        spin: rand(-9, 9),
      });
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      if (p.kind === "spark") {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - 2.4 * dt;
        p.vy *= 1 - 2.4 * dt;
      } else if (p.kind === "smoke") {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.size += 26 * dt;
        p.vx *= 1 - 1.4 * dt;
        p.vy *= 1 - 1.4 * dt;
      } else if (p.kind === "debris") {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 300 * dt;
        p.vx *= 1 - 0.7 * dt;
        p.rot = (p.rot ?? 0) + (p.spin ?? 0) * dt;
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  /* ----------------------------- 绘制 ----------------------------- */

  private draw(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.backdrop.draw(ctx, this.scroll, this.time);

    ctx.save();
    if (this.shake > 0.4) {
      ctx.translate(rand(-this.shake, this.shake) * 0.6, rand(-this.shake, this.shake) * 0.6);
    }
    for (const o of this.obstacles) if (!o.dead) this.drawObstacle(o);
    for (const p of this.powerups) this.drawPowerUp(p);
    for (const e of this.enemies) if (!e.dead) this.drawEnemy(e);
    if (this.boss) this.drawBoss(this.boss);
    for (const b of this.bullets) this.drawPlayerBullet(b);
    for (const b of this.enemyBullets) this.drawEnemyBullet(b);
    if (this.respawn <= 0) this.drawPlayer();
    this.drawParticles();
    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 250, 235, ${Math.min(0.75, this.flash)})`;
      ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    }
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0);
    if (this.state === "ready") this.drawReady();
  }

  /** 关卡开场：把「第几关 / 关名 / GET READY」直接画进游戏画面。 */
  private drawReady(): void {
    const ctx = this.ctx;
    const progress = 1 - this.readyIn / READY_SECONDS;
    ctx.save();
    ctx.fillStyle = "rgba(2, 6, 14, 0.58)";
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    const band = ctx.createLinearGradient(0, 220, 0, 490);
    band.addColorStop(0, "rgba(8, 24, 38, 0)");
    band.addColorStop(0.22, "rgba(8, 24, 38, 0.82)");
    band.addColorStop(0.78, "rgba(8, 24, 38, 0.82)");
    band.addColorStop(1, "rgba(8, 24, 38, 0)");
    ctx.fillStyle = band;
    ctx.fillRect(0, 220, FIELD_W, 270);

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(125, 230, 255, 0.8)";
    ctx.font = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("MISSION START", FIELD_W / 2, 258);
    ctx.fillStyle = "#f2fbff";
    ctx.font = "900 46px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(`STAGE ${this.stage}`, FIELD_W / 2, 314);
    ctx.fillStyle = "#a9e9ff";
    ctx.font = "600 19px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(this.def.name, FIELD_W / 2, 344);
    ctx.fillStyle = "rgba(160, 220, 245, 0.55)";
    ctx.font = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(this.def.subtitle, FIELD_W / 2, 362);

    ctx.fillStyle = "rgba(255, 255, 255, 0.42)";
    ctx.font = "700 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("GET READY", FIELD_W / 2, 404);
    const remain = Math.max(1, Math.ceil(this.readyIn - 0.2));
    const pulse = 1 + Math.sin(this.time * 9) * 0.04;
    ctx.save();
    ctx.translate(FIELD_W / 2, 452);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = "#7fe8ff";
    ctx.shadowColor = "rgba(90, 220, 255, 0.8)";
    ctx.shadowBlur = 24;
    ctx.font = "900 54px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(String(remain), 0, 16);
    ctx.restore();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255, 255, 255, 0.32)";
    ctx.font = "500 10px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("拖动画面 / 方向键移动 · 自动射击 · X / K / 空格 炸弹", FIELD_W / 2, 512);
    ctx.fillText("P / Esc 暂停 · 顶部状态栏显示当前子弹类型与等级", FIELD_W / 2, 530);

    ctx.fillStyle = "rgba(125, 230, 255, 0.2)";
    ctx.fillRect(140, 550, 200, 2);
    ctx.fillStyle = "rgba(125, 230, 255, 0.85)";
    ctx.fillRect(140, 550, 200 * clamp(progress, 0, 1), 2);
    ctx.restore();
  }

  private drawObstacle(o: Obstacle): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(o.x, o.y);

    // 地面投影，让障碍物与空中单位分层。
    ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
    ctx.beginPath();
    ctx.ellipse(4, 8, o.r * 1.12, o.r * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();

    if (o.kind === "mine") {
      const pulse = 0.5 + 0.5 * Math.sin(o.t * 6 + o.drift);
      for (let i = 0; i < 8; i += 1) {
        const a = (i * Math.PI) / 4 + o.t * 0.6;
        ctx.strokeStyle = "#43494f";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * o.r * 0.7, Math.sin(a) * o.r * 0.7);
        ctx.lineTo(Math.cos(a) * (o.r + 6), Math.sin(a) * (o.r + 6));
        ctx.stroke();
        ctx.fillStyle = "#7a828a";
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (o.r + 6), Math.sin(a) * (o.r + 6), 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      const body = ctx.createRadialGradient(-4, -5, 2, 0, 0, o.r);
      body.addColorStop(0, "#6c747c");
      body.addColorStop(0.6, "#3c4349");
      body.addColorStop(1, "#20262b");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#171c20";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.strokeStyle = "rgba(150, 165, 175, 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, o.r * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255, ${70 + pulse * 60}, 60, ${0.55 + pulse * 0.45})`;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.kind === "barrier" || o.kind === "barricade") {
      const concrete = o.kind === "barrier";
      ctx.save();
      ctx.rotate(Math.sin(o.t * 0.6 + o.drift) * 0.08);
      const grad = ctx.createLinearGradient(0, -o.r, 0, o.r);
      grad.addColorStop(0, concrete ? "#b9b4a6" : "#8d949a");
      grad.addColorStop(0.55, concrete ? "#8b877c" : "#666d73");
      grad.addColorStop(1, concrete ? "#5d5a52" : "#434a50");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-o.r, -o.r * 0.55);
      ctx.lineTo(o.r, -o.r * 0.55);
      ctx.lineTo(o.r * 0.82, o.r * 0.72);
      ctx.lineTo(-o.r * 0.82, o.r * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(20, 22, 24, 0.55)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // 警示斜纹
      ctx.save();
      ctx.beginPath();
      ctx.rect(-o.r * 0.92, -o.r * 0.34, o.r * 1.84, o.r * 0.5);
      ctx.clip();
      for (let i = -3; i < 4; i += 1) {
        ctx.fillStyle = i % 2 === 0 ? "#e0b53c" : "#2c2f31";
        ctx.save();
        ctx.translate(i * 12, 0);
        ctx.rotate(-0.5);
        ctx.fillRect(-4, -o.r, 8, o.r * 1.2);
        ctx.restore();
      }
      ctx.restore();
      ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
      ctx.fillRect(-o.r * 0.9, -o.r * 0.52, o.r * 1.8, 2.4);
      if (!concrete) {
        for (const side of [-1, 1]) {
          ctx.fillStyle = "#4a5157";
          ctx.fillRect(side * o.r * 0.55 - 2.6, -o.r * 0.2, 5.2, o.r * 0.9);
          ctx.fillStyle = "#ff5a4a";
          ctx.beginPath();
          ctx.arc(side * o.r * 0.55, -o.r * 0.72, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    } else if (o.kind === "container") {
      ctx.save();
      const grad = ctx.createLinearGradient(-o.r, 0, o.r, 0);
      grad.addColorStop(0, "#2f5d6b");
      grad.addColorStop(0.5, "#4f9aae");
      grad.addColorStop(1, "#27505c");
      ctx.fillStyle = grad;
      ctx.fillRect(-o.r, -o.r * 0.7, o.r * 2, o.r * 1.4);
      ctx.strokeStyle = "rgba(10, 24, 28, 0.7)";
      ctx.lineWidth = 1.6;
      ctx.strokeRect(-o.r, -o.r * 0.7, o.r * 2, o.r * 1.4);
      // 波纹板
      ctx.strokeStyle = "rgba(12, 30, 36, 0.35)";
      ctx.lineWidth = 1.2;
      for (let i = -3; i <= 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * (o.r / 4), -o.r * 0.66);
        ctx.lineTo(i * (o.r / 4), o.r * 0.66);
        ctx.stroke();
      }
      ctx.fillStyle = "#e8c95c";
      ctx.fillRect(-o.r * 0.7, -o.r * 0.16, o.r * 0.5, 3);
      ctx.fillRect(-o.r * 0.7, o.r * 0.02, o.r * 0.34, 3);
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.fillRect(-o.r, -o.r * 0.7, o.r * 2, 2.4);
      ctx.restore();
    } else if (o.kind === "asteroid") {
      ctx.save();
      ctx.rotate(o.t * 0.35 + o.drift);
      const rock = ctx.createRadialGradient(-o.r * 0.35, -o.r * 0.35, 3, 0, 0, o.r * 1.05);
      rock.addColorStop(0, "#b4a58c");
      rock.addColorStop(0.55, "#7e7060");
      rock.addColorStop(1, "#43392f");
      ctx.fillStyle = rock;
      ctx.beginPath();
      const jag = 7;
      for (let i = 0; i < jag; i += 1) {
        const a = (i / jag) * Math.PI * 2;
        const rr = o.r * (0.82 + ((i * 37 + Math.floor(o.drift * 10)) % 5) * 0.05);
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(35, 28, 22, 0.6)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = "rgba(45, 38, 30, 0.5)";
      for (const [cx, cy, cr] of [
        [-o.r * 0.3, -o.r * 0.2, o.r * 0.2],
        [o.r * 0.32, o.r * 0.18, o.r * 0.15],
        [o.r * 0.05, -o.r * 0.45, o.r * 0.1],
      ]) {
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(210, 195, 170, 0.35)";
      ctx.beginPath();
      ctx.moveTo(-o.r * 0.5, o.r * 0.1);
      ctx.lineTo(-o.r * 0.05, o.r * 0.4);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.rotate(o.t * 1.1 + o.drift);
      const grad = ctx.createLinearGradient(-o.r, -o.r, o.r, o.r);
      grad.addColorStop(0, "#8d969e");
      grad.addColorStop(0.5, "#525b62");
      grad.addColorStop(1, "#2b3237");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-o.r, -o.r * 0.45);
      ctx.lineTo(o.r * 0.7, -o.r * 0.72);
      ctx.lineTo(o.r, o.r * 0.35);
      ctx.lineTo(-o.r * 0.65, o.r * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(15, 20, 24, 0.65)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 170, 90, 0.75)";
      ctx.fillRect(-o.r * 0.45, -o.r * 0.3, o.r * 0.5, 2);
      ctx.restore();
    }

    if (o.flash > 0) {
      const radius = o.r * 1.5;
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, radius);
      glow.addColorStop(0, `rgba(255, 255, 255, ${o.flash * 0.4})`);
      glow.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    {
      const width = Math.max(18, o.r * 1.5);
      const y = o.y - o.r - 10;
      const frac = clamp(o.hp / o.maxHp, 0, 1);
      ctx.fillStyle = "rgba(8, 12, 18, 0.7)";
      ctx.fillRect(o.x - width / 2, y, width, 3);
      ctx.fillStyle = frac > 0.5 ? "#8ee7a0" : frac > 0.25 ? "#ffc857" : "#ff6b5c";
      ctx.fillRect(o.x - width / 2, y, width * frac, 3);
    }
  }

  private drawPlayer(): void {
    const ctx = this.ctx;
    const tilt = clamp(this.playerVX * 0.00055, -0.22, 0.22);
    const tier = this.weaponLevel;
    const spec = ballistics(this.weaponType, tier);
    const maxed = tier >= MAX_WEAPON_LEVEL;
    const accent = WEAPONS[this.weaponType].color;
    // 机翼随等级展宽；不同弹种在翼下挂不同的武器舱。
    const span = Math.min(34, 22 + (tier - 1) * 1.8);
    ctx.save();
    // 受击硬直期间闪烁，给玩家“刚挨打”的即时反馈。
    if (this.hurtInvuln > 0 && Math.sin(this.time * 55) > 0) ctx.globalAlpha = 0.42;
    ctx.translate(this.playerX, this.playerY);
    ctx.rotate(tilt);
    ctx.scale(0.97 + Math.min(7, tier) * 0.012, 0.97 + Math.min(7, tier) * 0.012);

    // 尾焰：Lv3 起换成双发，满级带金色
    const flame = 13 + Math.sin(this.time * 42) * 4;
    const drawFlame = (fx: number, width: number, length: number) => {
      const flameGradient = ctx.createLinearGradient(0, 12, 0, 12 + length);
      flameGradient.addColorStop(0, maxed ? "rgba(255, 232, 168, 0.95)" : "rgba(160, 240, 255, 0.95)");
      flameGradient.addColorStop(0.5, maxed ? "rgba(255, 170, 60, 0.78)" : "rgba(70, 160, 255, 0.75)");
      flameGradient.addColorStop(1, "rgba(40, 80, 255, 0)");
      ctx.fillStyle = flameGradient;
      ctx.beginPath();
      ctx.moveTo(fx - width, 12);
      ctx.lineTo(fx + width, 12);
      ctx.lineTo(fx, 12 + length);
      ctx.closePath();
      ctx.fill();
    };
    if (tier >= 3) {
      drawFlame(-5.5, 3.4, flame * 0.84);
      drawFlame(5.5, 3.4, flame * 0.84);
    } else {
      drawFlame(0, 5, flame);
    }

    // 机翼随火力等级展宽，满级镶金边
    const wing = ctx.createLinearGradient(-span, 0, span, 0);
    wing.addColorStop(0, "#5d7f9c");
    wing.addColorStop(0.5, "#dfeefc");
    wing.addColorStop(1, "#5d7f9c");
    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.moveTo(0, -23);
    ctx.lineTo(5, -8);
    ctx.lineTo(span, 5);
    ctx.lineTo(span - 2, 11);
    ctx.lineTo(6, 9);
    ctx.lineTo(4, 16);
    ctx.lineTo(-4, 16);
    ctx.lineTo(-6, 9);
    ctx.lineTo(-span + 2, 11);
    ctx.lineTo(-span, 5);
    ctx.lineTo(-5, -8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = maxed ? "rgba(255, 214, 120, 0.95)" : accent;
    ctx.lineWidth = maxed ? 1.6 : 1.2;
    ctx.stroke();

    // 机炮与散射都在翼面装机炮管，等级越高越多
    if (tier >= 2) {
      for (const side of [-1, 1]) {
        ctx.fillStyle = "#25313b";
        ctx.fillRect(side * 7 - 1.5, -17, 3, 13);
        ctx.fillStyle = "#9fb8c8";
        ctx.fillRect(side * 7 - 1.5, -19, 3, 3);
      }
    }
    if (tier >= 4) {
      for (const side of [-1, 1]) {
        ctx.fillStyle = "#2d3c46";
        ctx.fillRect(side * (span - 9) - 1.4, -2, 2.8, 12);
        ctx.fillStyle = "#c8d9e4";
        ctx.fillRect(side * (span - 9) - 1.4, -4, 2.8, 2.6);
      }
    }

    // 装甲加强件：等级越高机身越厚实
    if (tier >= 3) {
      ctx.fillStyle = "rgba(30, 48, 60, 0.9)";
      ctx.fillRect(-7.5, -12, 15, 7);
      ctx.fillStyle = "rgba(120, 210, 235, 0.35)";
      ctx.fillRect(-5.5, -11, 11, 1.6);
    }
    if (maxed) {
      for (const side of [-1, 1]) {
        ctx.fillStyle = "rgba(255, 206, 112, 0.85)";
        ctx.fillRect(side * (span - 5) - 1, 2, 2, 7);
      }
    }

    // 弹种专属挂载：一眼看出当前用的是哪一种子弹。
    this.drawWeaponMounts(span, spec, accent);

    // 座舱：辉光跟当前弹种同色
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(0, -8, 3.4, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.ellipse(-0.8, -10, 1.4, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 翼尖灯
    const blink = Math.sin(this.time * 14) > 0;
    if (blink) {
      ctx.fillStyle = "#ff5d6c";
      ctx.beginPath();
      ctx.arc(-span + 1, 6, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5dff9d";
      ctx.beginPath();
      ctx.arc(span - 1, 6, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 机体血条：常显在机身上方，HUD 里另有精确数值。
    const hpFrac = clamp(this.hp / PLAYER_MAX_HP, 0, 1);
    const barW = 46;
    const barY = this.playerY - 38;
    ctx.save();
    ctx.fillStyle = "rgba(5, 10, 16, 0.72)";
    ctx.fillRect(this.playerX - barW / 2 - 1, barY - 1, barW + 2, 6);
    ctx.fillStyle = hpFrac > 0.5 ? "#6ef0a8" : hpFrac > 0.25 ? "#ffc857" : "#ff6b5c";
    ctx.fillRect(this.playerX - barW / 2, barY, barW * hpFrac, 4);
    ctx.strokeStyle = "rgba(160, 230, 255, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(this.playerX - barW / 2 - 1, barY - 1, barW + 2, 6);
    ctx.fillStyle = "rgba(225, 248, 255, 0.72)";
    ctx.font = "700 8px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${Math.round(this.hp)}`, this.playerX, barY - 2);
    ctx.restore();

    if (this.invincible > 0) {
      const alpha = this.invincible < 1 ? 0.4 + Math.sin(this.time * 40) * 0.3 : 0.55;
      ctx.save();
      ctx.strokeStyle = `rgba(140, 230, 255, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.playerX, this.playerY, 28 + Math.sin(this.time * 6) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      const bubble = ctx.createRadialGradient(this.playerX, this.playerY, 8, this.playerX, this.playerY, 30);
      bubble.addColorStop(0, "rgba(100, 210, 255, 0.04)");
      bubble.addColorStop(1, "rgba(100, 210, 255, 0.16)");
      ctx.fillStyle = bubble;
      ctx.beginPath();
      ctx.arc(this.playerX, this.playerY, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * 翼下挂载：五种子弹类型各有各的 silhouette，等级改变数量与尺寸。
   * 在自机的旋转/缩放坐标系内调用，所以局部坐标就是机身坐标。
   */
  private drawWeaponMounts(span: number, spec: Ballistics, accent: string): void {
    const ctx = this.ctx;
    ctx.save();
    switch (this.weaponType) {
      case "S": {
        const pods = Math.min(4, Math.ceil(spec.streams / 4));
        for (let i = 0; i < pods; i += 1) {
          for (const side of [-1, 1]) {
            const px = side * (span - 3 - i * 3.5);
            ctx.fillStyle = "#1e2b33";
            ctx.fillRect(px - 2, 1 + i * 2, 4, 5.5);
            ctx.fillStyle = accent;
            ctx.globalAlpha = 0.6 + Math.sin(this.time * 8 + i + side) * 0.2;
            ctx.fillRect(px - 1, 2 + i * 2, 2, 3);
            ctx.globalAlpha = 1;
          }
        }
        break;
      }
      case "M": {
        for (let i = 0; i < spec.streams; i += 1) {
          const side = i % 2 === 0 ? -1 : 1;
          const px = side * (span - 6 - Math.floor(i / 2) * 3);
          ctx.fillStyle = "#e7eef5";
          ctx.fillRect(px - 1.2, 4, 2.4, 9);
          ctx.fillStyle = accent;
          ctx.fillRect(px - 1.2, 11, 2.4, 2);
        }
        break;
      }
      case "L": {
        ctx.fillStyle = "#1a2230";
        ctx.fillRect(-4, -22, 8, 6);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.55 + Math.sin(this.time * 12) * 0.3;
        ctx.fillRect(-2.4, -25, 4.8, 5);
        ctx.globalAlpha = 1;
        for (const side of [-1, 1]) {
          ctx.fillStyle = "#2b3646";
          ctx.fillRect(side * 10 - 1, -12, 2, 14);
        }
        break;
      }
      case "P": {
        for (const side of [-1, 1]) {
          ctx.fillStyle = "#3a2a2a";
          ctx.beginPath();
          ctx.arc(side * (span - 8), 4, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = accent;
          ctx.beginPath();
          ctx.arc(side * (span - 8), 4, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        if (spec.streams >= 2) {
          ctx.fillStyle = "#4a3327";
          ctx.fillRect(-3, 6, 6, 8);
        }
        break;
      }
      case "W": {
        if (spec.streams >= 5) {
          ctx.fillStyle = "#2a3a44";
          ctx.fillRect(-1.6, -23, 3.2, 12);
          ctx.fillStyle = accent;
          ctx.fillRect(-1.6, -24, 3.2, 2.4);
        }
        break;
      }
    }
    ctx.restore();
  }

  private drawEnemy(e: Enemy): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(e.x, e.y);

    if (e.kind === "drone") {
      ctx.rotate(Math.sin(e.t * 3.2 + e.seed) * 0.12);
      const flame = 7 + Math.sin(e.t * 34 + e.seed) * 3;
      ctx.fillStyle = "rgba(255, 130, 70, 0.62)";
      ctx.beginPath();
      ctx.moveTo(-3.4, 8);
      ctx.lineTo(0, 8 + flame);
      ctx.lineTo(3.4, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = e.elite ? "#a86b22" : "#5f2430";
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(-11, -16);
      ctx.lineTo(-4, -18);
      ctx.lineTo(0, -10);
      ctx.lineTo(4, -18);
      ctx.lineTo(11, -16);
      ctx.closePath();
      ctx.fill();
      const body = ctx.createLinearGradient(0, -16, 0, 17);
      body.addColorStop(0, e.elite ? "#e0a13c" : "#c25b52");
      body.addColorStop(0.55, e.elite ? "#a06a24" : "#8c3540");
      body.addColorStop(1, e.elite ? "#6e4614" : "#571d27");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(0, 17);
      ctx.lineTo(7, 4);
      ctx.lineTo(17, -6);
      ctx.lineTo(13, -11);
      ctx.lineTo(5, -8);
      ctx.lineTo(4, -15);
      ctx.lineTo(-4, -15);
      ctx.lineTo(-5, -8);
      ctx.lineTo(-13, -11);
      ctx.lineTo(-17, -6);
      ctx.lineTo(-7, 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 195, 155, 0.32)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = "rgba(20, 10, 14, 0.5)";
      ctx.beginPath();
      ctx.moveTo(0, 12);
      ctx.lineTo(0, -12);
      ctx.stroke();
      ctx.fillStyle = "#8fe6ff";
      ctx.beginPath();
      ctx.ellipse(0, 6, 2.6, 4.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.beginPath();
      ctx.arc(-0.8, 4.4, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = e.t % 1 < 0.5 ? "#ff6a5c" : "#5c1f1f";
      ctx.fillRect(-17, -7, 2.4, 2.4);
      ctx.fillRect(14.6, -7, 2.4, 2.4);
    } else if (e.kind === "heli") {
      const g = ctx.createLinearGradient(-13, 0, 13, 0);
      g.addColorStop(0, e.elite ? "#7c6023" : "#455230");
      g.addColorStop(0.5, e.elite ? "#b98f3c" : "#6b7b45");
      g.addColorStop(1, e.elite ? "#5e4716" : "#333d22");
      ctx.fillStyle = "#2a3320";
      ctx.fillRect(-2.5, -26, 5, 16);
      ctx.beginPath();
      ctx.moveTo(-2, -27);
      ctx.lineTo(-9, -31);
      ctx.lineTo(-4, -20);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(210, 225, 200, 0.6)";
      ctx.lineWidth = 1.6;
      const tailRotor = Math.sin(e.t * 42) * 6;
      ctx.beginPath();
      ctx.moveTo(-7 - tailRotor, -27);
      ctx.lineTo(-7 + tailRotor, -27);
      ctx.stroke();
      ctx.fillStyle = e.elite ? "#8a6b28" : "#4e5c31";
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(-17, 1);
      ctx.lineTo(-16, 6);
      ctx.lineTo(0, 4);
      ctx.lineTo(16, 6);
      ctx.lineTo(17, 1);
      ctx.closePath();
      ctx.fill();
      for (const side of [-1, 1]) {
        ctx.fillStyle = "#20261a";
        ctx.fillRect(side * 13 - 3, 2, 6, 8);
        ctx.fillStyle = e.t % 0.8 > 0.4 ? "#ffcf5c" : "#8a6a28";
        ctx.beginPath();
        ctx.arc(side * 13, 5.5, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 2, 12, 19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(20, 26, 14, 0.65)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = "#232a18";
      ctx.fillRect(-1.5, 15, 3, 7);
      ctx.fillStyle = "rgba(150, 230, 255, 0.85)";
      ctx.beginPath();
      ctx.ellipse(0, 10.5, 5.4, 6.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.beginPath();
      ctx.ellipse(-1.6, 8.8, 1.6, 2.4, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#39452a";
      ctx.fillRect(-1.5, -20, 3, 8);
      const rotor = Math.sin(e.t * 26) * 20;
      ctx.strokeStyle = "rgba(215, 230, 205, 0.68)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-rotor, -22);
      ctx.lineTo(rotor, -22);
      ctx.stroke();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = "rgba(215, 230, 205, 0.7)";
      ctx.beginPath();
      ctx.moveTo(-rotor * 0.4, -23);
      ctx.lineTo(rotor * 0.4, -21);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = e.t % 1 < 0.5 ? "#ff5f5f" : "#5a2020";
      ctx.beginPath();
      ctx.arc(-12.5, 3, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = e.t % 1 > 0.5 ? "#66ff9c" : "#205a34";
      ctx.beginPath();
      ctx.arc(12.5, 3, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === "turret") {
      const angle = Math.atan2(this.playerY - e.y, this.playerX - e.x);
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.beginPath();
      ctx.ellipse(3, 6, 20, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      const base = ctx.createRadialGradient(-4, -6, 4, 0, 0, 19);
      base.addColorStop(0, "#66765d");
      base.addColorStop(0.6, "#3d4c42");
      base.addColorStop(1, "#232c26");
      ctx.fillStyle = base;
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const a = (i * Math.PI) / 4 + Math.PI / 8;
        const px = Math.cos(a) * 18;
        const py = Math.sin(a) * 18;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#1b231e";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#7d8c74";
      for (let i = 0; i < 8; i += 1) {
        const a = (i * Math.PI) / 4 + Math.PI / 8;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 14.5, Math.sin(a) * 14.5, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(255, 190, 70, 0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-15, 9);
      ctx.lineTo(-9, 9);
      ctx.moveTo(-15, 12);
      ctx.lineTo(-9, 12);
      ctx.stroke();
      ctx.fillStyle = "#38443a";
      ctx.beginPath();
      ctx.arc(-10.5, -10, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1b231e";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.save();
      ctx.rotate(angle);
      ctx.fillStyle = "#2a332b";
      ctx.fillRect(8, -6.5, 22, 4.4);
      ctx.fillRect(8, 2.1, 22, 4.4);
      ctx.fillStyle = "#93a18d";
      ctx.fillRect(24, -7.5, 4.5, 6.4);
      ctx.fillRect(24, 1.1, 4.5, 6.4);
      ctx.fillStyle = "#4c5a4c";
      ctx.beginPath();
      ctx.arc(0, 0, 10.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(160, 185, 155, 0.4)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = "#1a211c";
      ctx.beginPath();
      ctx.arc(0, 0, 5.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this.time % 1 > 0.5 ? "#ff6c5c" : "#80362f";
      ctx.beginPath();
      ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (e.kind === "tank") {
      ctx.scale(e.dir, 1);
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.beginPath();
      ctx.ellipse(4, 6, 26, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      const treads = ctx.createLinearGradient(0, -15, 0, 15);
      treads.addColorStop(0, "#20261d");
      treads.addColorStop(0.5, "#333b2d");
      treads.addColorStop(1, "#161b14");
      ctx.fillStyle = treads;
      ctx.fillRect(-22, -15, 44, 10);
      ctx.fillRect(-22, 5, 44, 10);
      ctx.fillStyle = "#454e3b";
      const treadOffset = (e.t * 26) % 7;
      for (let i = 0; i < 7; i += 1) {
        const tx = -21 + i * 7 + treadOffset;
        if (tx > 20) continue;
        ctx.fillRect(tx, -14, 2.4, 8);
        ctx.fillRect(tx, 6, 2.4, 8);
      }
      ctx.fillStyle = "#2a3025";
      for (const wy of [-10, 10]) {
        for (let i = 0; i < 5; i += 1) {
          ctx.beginPath();
          ctx.arc(-16 + i * 8, wy, 3.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const hull = ctx.createLinearGradient(0, -8, 0, 8);
      hull.addColorStop(0, "#72805f");
      hull.addColorStop(0.45, "#4d5843");
      hull.addColorStop(1, "#2f372a");
      ctx.fillStyle = hull;
      ctx.beginPath();
      ctx.moveTo(-21, -8);
      ctx.lineTo(20, -8);
      ctx.lineTo(17, 8);
      ctx.lineTo(-17, 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(20, 26, 16, 0.7)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = "#4a543d";
      for (let i = 0; i < 5; i += 1) ctx.fillRect(-19 + i * 8, -9.5, 6, 2.6);
      ctx.fillStyle = "#8a9770";
      ctx.beginPath();
      ctx.ellipse(0, -2, 12, 9.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#2b3325";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = "#3e4738";
      ctx.fillRect(-10, -8, 20, 4.5);
      const aim = Math.atan2((this.playerX - e.x) * e.dir, this.playerY - e.y);
      ctx.save();
      ctx.translate(0, -1.5);
      ctx.rotate(-aim);
      ctx.fillStyle = "#333d2c";
      ctx.beginPath();
      ctx.arc(0, 2, 5.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#232b1f";
      ctx.fillRect(-2.6, 4, 5.2, 20);
      ctx.fillStyle = "#66735a";
      ctx.fillRect(-3.4, 20, 6.8, 4);
      ctx.fillStyle = "#11160f";
      ctx.fillRect(-3.4, 23.6, 6.8, 1.6);
      ctx.restore();
      ctx.fillStyle = "rgba(255, 215, 120, 0.85)";
      ctx.fillRect(-18, -4, 2.6, 2.6);
      ctx.fillStyle = "#ffcf5c";
      ctx.beginPath();
      ctx.arc(19, -2, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const g = ctx.createLinearGradient(0, -26, 0, 22);
      g.addColorStop(0, e.elite ? "#8a5a2a" : "#4b5a5c");
      g.addColorStop(0.55, e.elite ? "#6b431d" : "#334145");
      g.addColorStop(1, e.elite ? "#3f2910" : "#1c2629");
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.beginPath();
      ctx.ellipse(4, 8, 28, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      for (const side of [-1, 1]) {
        ctx.fillStyle = "#232d31";
        ctx.fillRect(side * 19 - 7, -8, 14, 24);
        ctx.fillStyle = e.elite ? "#c9964a" : "#5a6d70";
        ctx.fillRect(side * 19 - 7, -8, 14, 3);
        const glow = 0.45 + 0.35 * Math.sin(e.t * 9 + side);
        ctx.fillStyle = `rgba(120, 220, 255, ${glow})`;
        ctx.fillRect(side * 19 - 3.5, 14, 7, 4);
        ctx.fillStyle = "#20282b";
        ctx.fillRect(side * 24 - 6, -1, 12, 12);
        ctx.fillStyle = "#8c9a9c";
        for (let i = 0; i < 3; i += 1) {
          ctx.beginPath();
          ctx.arc(side * 24 - 3 + i * 3, 2, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -28);
      ctx.lineTo(15, -18);
      ctx.lineTo(24, 4);
      ctx.lineTo(15, 20);
      ctx.lineTo(0, 25);
      ctx.lineTo(-15, 20);
      ctx.lineTo(-24, 4);
      ctx.lineTo(-15, -18);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = e.elite ? "rgba(255, 200, 120, 0.75)" : "rgba(140, 210, 220, 0.45)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.strokeStyle = "rgba(10, 16, 18, 0.6)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-15, -14);
      ctx.lineTo(-9, 10);
      ctx.moveTo(15, -14);
      ctx.lineTo(9, 10);
      ctx.stroke();
      ctx.fillStyle = "#1c2528";
      ctx.fillRect(-16, -2, 32, 10);
      ctx.fillStyle = "#101719";
      ctx.fillRect(-8, 20, 16, 7);
      ctx.fillStyle = "#ff9d5c";
      ctx.fillRect(-6, 28, 4, 3);
      ctx.fillRect(2, 28, 4, 3);
      const cockpit = ctx.createRadialGradient(-2, 0, 1, 0, 2, 9);
      cockpit.addColorStop(0, "rgba(220, 255, 255, 0.95)");
      cockpit.addColorStop(0.5, "rgba(120, 230, 255, 0.8)");
      cockpit.addColorStop(1, "rgba(40, 110, 150, 0.2)");
      ctx.fillStyle = cockpit;
      ctx.beginPath();
      ctx.ellipse(0, 2, 6, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5f7578";
      ctx.fillRect(-21, -12, 3, 10);
      ctx.fillRect(18, -12, 3, 10);
    }

    if (e.flash > 0) {
      // 命中反馈用贴合轮廓的软辉光，避免整机变成一个白色圆盘。
      const radius = e.r * 1.35;
      const glow = ctx.createRadialGradient(0, 0, e.r * 0.2, 0, 0, radius);
      glow.addColorStop(0, `rgba(255, 255, 255, ${e.flash * 0.26})`);
      glow.addColorStop(0.6, `rgba(255, 240, 210, ${e.flash * 0.1})`);
      glow.addColorStop(1, "rgba(255, 240, 210, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (e.elite) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 190, 90, 0.65)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 敌方血条：始终显示，精英加金边，颜色随剩余比例变化。
    const barOffset: Record<EnemyKind, number> = {
      drone: 24,
      heli: 37,
      turret: 30,
      tank: 25,
      gunship: 37,
    };
    const barY = e.y - barOffset[e.kind];
    if (barY > 4) {
      const width = Math.max(22, e.r * 1.9) + (e.elite ? 8 : 0);
      const frac = clamp(e.hp / e.maxHp, 0, 1);
      ctx.save();
      ctx.fillStyle = "rgba(5, 10, 16, 0.72)";
      ctx.fillRect(e.x - width / 2 - 1, barY - 1, width + 2, 5);
      ctx.fillStyle = e.elite ? "#ffd75e" : frac > 0.5 ? "#8ee7a0" : frac > 0.25 ? "#ffc857" : "#ff6b5c";
      ctx.fillRect(e.x - width / 2, barY, width * frac, 3);
      if (e.elite) {
        ctx.strokeStyle = "rgba(255, 205, 110, 0.8)";
        ctx.lineWidth = 0.8;
        ctx.strokeRect(e.x - width / 2 - 1, barY - 1, width + 2, 5);
      }
      ctx.restore();
    }
  }

  private drawPowerUp(p: PowerUp): void {
    const ctx = this.ctx;
    const color =
      p.type === "C" ? LOOT_PICKUP_COLOR : p.type === "B" ? BOMB_PICKUP_COLOR : WEAPONS[p.type].color;
    ctx.save();
    ctx.translate(p.x, p.y);
    const pop = p.shuffle > 0 ? 1 + p.shuffle * 0.9 : 1;
    ctx.scale((1 + Math.sin(p.t * 5) * 0.08) * pop, (1 + Math.sin(p.t * 5) * 0.08) * pop);
    if (p.type === "C") {
      // 战利品：金色菱形箱 + 面额，和其他补给一眼区分。
      ctx.fillStyle = "rgba(16, 12, 4, 0.88)";
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(14, 0);
      ctx.lineTo(0, 14);
      ctx.lineTo(-14, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = "bold 10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${p.value}cr`, 0, 0.5);
      ctx.restore();
      return;
    }
    // 与自己当前子弹同字母的补给加一圈光环：一眼能认出「这个吃了是升级，不是切换」。
    if (p.type === this.weaponType) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.35 + Math.sin(p.t * 7) * 0.2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "rgba(10, 16, 26, 0.85)";
    ctx.beginPath();
    ctx.arc(0, 0, PICKUP_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.shuffle > 0 ? "#ffffff" : color;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "bold 12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.type, 0, 0.5);
    ctx.restore();
  }

  private drawPlayerBullet(b: PlayerBullet): void {
    const ctx = this.ctx;
    if (b.kind === "missile") {
      const angle = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(angle);
      const flame = 5 + Math.sin(this.time * 40 + b.x) * 1.4;
      ctx.fillStyle = "rgba(255, 190, 90, 0.85)";
      ctx.beginPath();
      ctx.moveTo(-8, -2.4);
      ctx.lineTo(-8 - flame, 0);
      ctx.lineTo(-8, 2.4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e7eef5";
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(1, -3);
      ctx.lineTo(-7, -2.4);
      ctx.lineTo(-7, 2.4);
      ctx.lineTo(1, 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(120, 230, 255, 0.9)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#42e0ff";
      ctx.beginPath();
      ctx.arc(1, 0, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    if (b.kind === "laser") {
      // 激光：细长的双层光束，长度由速度决定，穿透时不会消失。
      const len = 58;
      const glow = ctx.createLinearGradient(b.x, b.y + len, b.x, b.y - len * 0.2);
      glow.addColorStop(0, "rgba(255, 255, 255, 0)");
      glow.addColorStop(0.35, `${WEAPONS[b.weapon].color}99`);
      glow.addColorStop(1, "rgba(255, 255, 255, 0.9)");
      ctx.strokeStyle = glow;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + len);
      ctx.lineTo(b.x, b.y - 8);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + len * 0.75);
      ctx.lineTo(b.x, b.y - 6);
      ctx.stroke();
      return;
    }
    if (b.kind === "shell") {
      // 榴弹：旋转的矮胖弹体 + 引信火花
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.sin(this.time * 12 + b.y * 0.05) * 0.35);
      ctx.fillStyle = "rgba(255, 150, 90, 0.5)";
      ctx.beginPath();
      ctx.arc(0, 6, 4.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a2f2b";
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = WEAPONS[b.weapon].color;
      ctx.beginPath();
      ctx.arc(0, -2.4, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.fillRect(-1, 2, 2, 5);
      ctx.restore();
      return;
    }
    const color = WEAPONS[b.weapon].color;
    ctx.strokeStyle = `${color}88`;
    ctx.lineWidth = b.kind === "cannon" && b.weapon === "S" ? 2.6 : 3.4;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.weapon === "S" ? 2.1 : 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawEnemyBullet(b: EnemyBullet): void {
    const ctx = this.ctx;
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBoss(b: BossState): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(b.x, b.y);

    if (b.stage === 1) {
      // 空母：甲板跑道 + 舰岛 + 双联近防炮 + 尾部推进器
      ctx.save();
      ctx.rotate(Math.sin(b.t * 0.9) * 0.018);
      ctx.fillStyle = "rgba(0, 0, 0, 0.36)";
      ctx.beginPath();
      ctx.ellipse(10, 16, 126, 48, 0, 0, Math.PI * 2);
      ctx.fill();

      const hull = ctx.createLinearGradient(0, -56, 0, 58);
      hull.addColorStop(0, "#93a1a5");
      hull.addColorStop(0.32, "#5f6f76");
      hull.addColorStop(0.72, "#38474d");
      hull.addColorStop(1, "#1f292e");
      ctx.fillStyle = hull;
      ctx.beginPath();
      ctx.moveTo(0, -56);
      ctx.lineTo(54, -48);
      ctx.lineTo(98, -26);
      ctx.lineTo(122, 4);
      ctx.lineTo(112, 32);
      ctx.lineTo(72, 44);
      ctx.lineTo(30, 52);
      ctx.lineTo(0, 58);
      ctx.lineTo(-30, 52);
      ctx.lineTo(-72, 44);
      ctx.lineTo(-112, 32);
      ctx.lineTo(-122, 4);
      ctx.lineTo(-98, -26);
      ctx.lineTo(-54, -48);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(170, 225, 235, 0.5)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // 飞行甲板
      ctx.fillStyle = "#232e32";
      ctx.beginPath();
      ctx.moveTo(0, -46);
      ctx.lineTo(30, -40);
      ctx.lineTo(38, 42);
      ctx.lineTo(18, 48);
      ctx.lineTo(-18, 48);
      ctx.lineTo(-38, 42);
      ctx.lineTo(-30, -40);
      ctx.closePath();
      ctx.fill();

      // 跑道灯与中线
      ctx.strokeStyle = "rgba(235, 240, 220, 0.5)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-24, -38);
      ctx.lineTo(-31, 39);
      ctx.moveTo(24, -38);
      ctx.lineTo(31, 39);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 214, 110, 0.75)";
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      ctx.lineDashOffset = -b.t * 30;
      ctx.beginPath();
      ctx.moveTo(0, -38);
      ctx.lineTo(0, 40);
      ctx.stroke();
      ctx.setLineDash([]);

      // 拦阻索
      ctx.strokeStyle = "rgba(200, 210, 210, 0.28)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i += 1) {
        const y = -18 + i * 14;
        ctx.beginPath();
        ctx.moveTo(-30 + i, y);
        ctx.lineTo(30 - i, y);
        ctx.stroke();
      }

      // 舰岛与旋转雷达
      const island = ctx.createLinearGradient(36, -32, 60, 12);
      island.addColorStop(0, "#4b5a60");
      island.addColorStop(1, "#26333a");
      ctx.fillStyle = island;
      ctx.fillRect(38, -34, 24, 46);
      ctx.fillStyle = "#1b2429";
      ctx.fillRect(42, -28, 16, 6);
      ctx.fillStyle = "rgba(150, 230, 255, 0.85)";
      ctx.fillRect(44, -26, 12, 2.4);
      ctx.fillStyle = "rgba(255, 205, 100, 0.9)";
      ctx.fillRect(44, 6, 3, 3);
      ctx.fillStyle = "#93a1a5";
      ctx.fillRect(49, -42, 3, 8);
      const radar = Math.sin(b.t * 2.3) * 0.7;
      ctx.strokeStyle = "#c4d1d4";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(50, -43);
      ctx.lineTo(50 + Math.cos(radar - Math.PI / 2) * 11, -43 + Math.sin(radar - Math.PI / 2) * 11);
      ctx.stroke();

      // 升降机 / 弹药库门
      for (const side of [-1, 1]) {
        ctx.fillStyle = "#161e22";
        ctx.fillRect(side * 44 - 13, 4, 26, 15);
        ctx.strokeStyle = "rgba(255, 190, 70, 0.5)";
        ctx.lineWidth = 1.2;
        ctx.strokeRect(side * 44 - 13, 4, 26, 15);
        ctx.fillStyle = "rgba(255, 190, 70, 0.25)";
        ctx.fillRect(side * 44 - 9, 7, 18, 2);
      }

      // 尾部推进器
      for (const side of [-1, 1]) {
        ctx.fillStyle = "#1a2327";
        ctx.fillRect(side * 50 - 11, -60, 22, 12);
        const glow = 0.5 + 0.3 * Math.sin(b.t * 9 + side);
        const jet = ctx.createLinearGradient(0, -56, 0, -44);
        jet.addColorStop(0, `rgba(160, 235, 255, ${glow})`);
        jet.addColorStop(1, "rgba(60, 140, 220, 0)");
        ctx.fillStyle = jet;
        ctx.fillRect(side * 50 - 8, -54, 16, 12);
      }

      // 甲板边缘灯
      for (let i = 0; i < 7; i += 1) {
        const y = -40 + i * 13;
        const lit = (Math.floor(b.t * 3) + i) % 3 === 0;
        ctx.fillStyle = lit ? "rgba(255, 220, 130, 0.95)" : "rgba(255, 220, 130, 0.25)";
        ctx.fillRect(-33, y, 2.2, 2.2);
        ctx.fillRect(31, y, 2.2, 2.2);
      }

      // 双联近防炮
      for (const side of [-1, 1]) {
        const angle = Math.atan2(this.playerY - (b.y + 18), this.playerX - (b.x + side * 82));
        ctx.save();
        ctx.translate(side * 82, 18);
        ctx.fillStyle = "#35434a";
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#172026";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#7e8e94";
        for (let i = 0; i < 6; i += 1) {
          const a = (i * Math.PI) / 3;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * 12, Math.sin(a) * 12, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.rotate(angle);
        ctx.fillStyle = "#26343a";
        ctx.fillRect(4, -7, 12, 14);
        ctx.fillStyle = "#9aa8ad";
        ctx.fillRect(10, -5, 18, 3.6);
        ctx.fillRect(10, 1.4, 18, 3.6);
        ctx.fillStyle = "#4a5a60";
        ctx.beginPath();
        ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ff5d5d";
        ctx.beginPath();
        ctx.arc(-3, 0, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const blink = Math.sin(b.t * 3.4) > 0.3;
      ctx.fillStyle = blink ? "rgba(255, 90, 90, 0.95)" : "rgba(120, 40, 40, 0.6)";
      ctx.beginPath();
      ctx.arc(0, -50, 3.4, 0, Math.PI * 2);
      ctx.fill();

      if (b.phase >= 2) {
        for (let i = 0; i < (b.phase >= 3 ? 3 : 1); i += 1) {
          const fx = Math.sin(b.t * 3 + i * 2.1) * 34;
          const fy = 22 + Math.cos(b.t * 2.4 + i) * 12;
          const flare = ctx.createRadialGradient(fx, fy, 1, fx, fy, 14);
          flare.addColorStop(0, "rgba(255, 220, 140, 0.55)");
          flare.addColorStop(0.45, "rgba(255, 120, 50, 0.35)");
          flare.addColorStop(1, "rgba(255, 80, 30, 0)");
          ctx.fillStyle = flare;
          ctx.beginPath();
          ctx.arc(fx, fy, 14, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    } else if (b.stage === 2) {
      // 铁蜈蚣：装甲节 + 步足 + 头部眼簇
      for (let i = b.segments.length - 1; i >= 0; i -= 1) {
        const seg = b.segments[i];
        const next = b.segments[i - 1] ?? seg;
        const prev = b.segments[i + 1] ?? seg;
        const dirX = next.x - prev.x;
        const dirY = next.y - prev.y;
        const angle = Math.atan2(dirX, -dirY);
        const radius = i === 0 ? 32 : Math.max(13, 23 - i * 0.5);
        ctx.save();
        ctx.translate(seg.x - b.x, seg.y - b.y);
        ctx.rotate(angle);

        if (i > 0) {
          ctx.strokeStyle = "rgba(58, 38, 72, 0.95)";
          ctx.lineWidth = 3;
          for (const side of [-1, 1]) {
            for (let leg = 0; leg < 3; leg += 1) {
              const baseY = -radius * 0.55 + leg * radius * 0.55;
              const swing = Math.sin(b.t * 8 + i * 1.3 + leg + (side > 0 ? Math.PI : 0)) * 5;
              ctx.beginPath();
              ctx.moveTo(side * radius * 0.45, baseY);
              ctx.lineTo(side * (radius + 10), baseY + 4 + swing);
              ctx.lineTo(side * (radius + 16), baseY + 12 + swing);
              ctx.stroke();
            }
          }
        }

        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.beginPath();
        ctx.ellipse(2, 4, radius * 1.05, radius * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();

        const shell = ctx.createRadialGradient(-radius * 0.35, -radius * 0.4, 2, 0, 0, radius * 1.2);
        shell.addColorStop(0, i === 0 ? "#7d4c8e" : "#5d3c70");
        shell.addColorStop(0.6, "#3a2848");
        shell.addColorStop(1, "#1e1528");
        ctx.fillStyle = shell;
        ctx.beginPath();
        ctx.moveTo(0, -radius * 1.18);
        ctx.lineTo(radius * 0.95, -radius * 0.5);
        ctx.lineTo(radius * 0.78, radius * 0.72);
        ctx.lineTo(0, radius * 1.1);
        ctx.lineTo(-radius * 0.78, radius * 0.72);
        ctx.lineTo(-radius * 0.95, -radius * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = i % 2 === 0 ? "rgba(255, 110, 210, 0.75)" : "rgba(180, 120, 255, 0.6)";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.strokeStyle = "rgba(20, 12, 30, 0.7)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-radius * 0.7, -radius * 0.3);
        ctx.lineTo(radius * 0.7, -radius * 0.3);
        ctx.moveTo(-radius * 0.55, radius * 0.35);
        ctx.lineTo(radius * 0.55, radius * 0.35);
        ctx.stroke();

        for (const side of [-1, 1]) {
          ctx.fillStyle = "#2a1c38";
          ctx.beginPath();
          ctx.moveTo(side * radius * 0.7, -radius * 0.15);
          ctx.lineTo(side * (radius + 9), radius * 0.05);
          ctx.lineTo(side * radius * 0.62, radius * 0.3);
          ctx.closePath();
          ctx.fill();
        }

        const pulse = 0.55 + 0.3 * Math.sin(b.t * 5 + i * 0.8);
        const core = ctx.createRadialGradient(0, 0, 1, 0, 0, radius * 0.55);
        core.addColorStop(0, `rgba(255, 190, 255, ${pulse})`);
        core.addColorStop(0.5, `rgba(230, 90, 220, ${pulse * 0.6})`);
        core.addColorStop(1, "rgba(120, 40, 160, 0)");
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.55, 0, Math.PI * 2);
        ctx.fill();

        if (i === 0) {
          const jaw = Math.sin(b.t * 4) * 0.16;
          for (const side of [-1, 1]) {
            ctx.save();
            ctx.translate(side * 17, 20);
            ctx.rotate(side * (0.5 + jaw));
            ctx.fillStyle = "#2a1c38";
            ctx.beginPath();
            ctx.moveTo(-4, -6);
            ctx.lineTo(side * 20, 12);
            ctx.lineTo(side * 11, 20);
            ctx.lineTo(-6, 6);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "rgba(255, 140, 90, 0.6)";
            ctx.lineWidth = 1.4;
            ctx.stroke();
            ctx.restore();
          }
          const eyes: [number, number, number][] = [
            [-11, -9, 3.6],
            [0, -14, 4.4],
            [11, -9, 3.6],
          ];
          for (const [ex, ey, er] of eyes) {
            const eye = ctx.createRadialGradient(ex, ey, 0.5, ex, ey, er + 2);
            eye.addColorStop(0, "#fff3b0");
            eye.addColorStop(0.5, "#ffb13d");
            eye.addColorStop(1, "rgba(255, 80, 40, 0)");
            ctx.fillStyle = eye;
            ctx.beginPath();
            ctx.arc(ex, ey, er + 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#3a0f0f";
            ctx.beginPath();
            ctx.arc(ex, ey, 1.3, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.strokeStyle = "rgba(210, 150, 255, 0.65)";
          ctx.lineWidth = 1.6;
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * 14, -20);
            ctx.quadraticCurveTo(side * 26, -32 + Math.sin(b.t * 3) * 3, side * 20, -42);
            ctx.stroke();
          }
        } else if (i === b.segments.length - 1) {
          ctx.fillStyle = "#241a30";
          ctx.fillRect(-4, radius * 0.7, 8, 16);
          ctx.fillStyle = "#b487d8";
          ctx.fillRect(-5.5, radius * 0.7 + 13, 11, 3);
        }
        ctx.restore();
      }
    } else if (b.stage === 3) {
      // 雷神核心：六座浮游炮 + 旋转环 + 虹膜核心
      for (let i = 0; i < 6; i += 1) {
        const podAngle = b.ringAngle * 0.32 + (i * Math.PI) / 3;
        ctx.save();
        ctx.translate(Math.cos(podAngle) * 78, Math.sin(podAngle) * 78);
        ctx.rotate(podAngle);
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.fillRect(-11, -8, 26, 18);
        const pod = ctx.createLinearGradient(0, -10, 0, 10);
        pod.addColorStop(0, "#5d7085");
        pod.addColorStop(0.55, "#33475c");
        pod.addColorStop(1, "#182633");
        ctx.fillStyle = pod;
        ctx.beginPath();
        ctx.moveTo(-12, -8);
        ctx.lineTo(10, -10);
        ctx.lineTo(17, 0);
        ctx.lineTo(10, 10);
        ctx.lineTo(-12, 8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(140, 210, 255, 0.55)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = "#1b2936";
        ctx.fillRect(8, -4, 16, 3);
        ctx.fillRect(8, 1, 16, 3);
        ctx.fillStyle = b.phase >= 2 ? "#9fe8ff" : "#4a7f9a";
        ctx.beginPath();
        ctx.arc(-2, 0, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.rotate(b.ringAngle);
      ctx.strokeStyle = "rgba(120, 210, 255, 0.7)";
      ctx.lineWidth = 3;
      ctx.setLineDash([26, 18]);
      ctx.beginPath();
      ctx.arc(0, 0, 66, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(190, 140, 255, 0.65)";
      ctx.setLineDash([14, 22]);
      ctx.beginPath();
      ctx.arc(0, 0, 50, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(180, 235, 255, 0.5)";
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 12; i += 1) {
        const a = (i * Math.PI) / 6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 62, Math.sin(a) * 62);
        ctx.lineTo(Math.cos(a) * 70, Math.sin(a) * 70);
        ctx.stroke();
      }
      ctx.restore();

      const frame = ctx.createLinearGradient(0, -52, 0, 52);
      frame.addColorStop(0, "#61788c");
      frame.addColorStop(0.5, "#33485a");
      frame.addColorStop(1, "#162330");
      ctx.fillStyle = frame;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i * Math.PI) / 3 + Math.PI / 6;
        const rx = Math.cos(a) * 52;
        const ry = Math.sin(a) * 52;
        if (i === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(160, 220, 255, 0.55)";
      ctx.lineWidth = 2;
      ctx.stroke();

      const irisOpen = b.phase >= 3 ? 0.75 : b.phase >= 2 ? 0.48 : 0.26;
      for (let i = 0; i < 6; i += 1) {
        const a = (i * Math.PI) / 3 + b.ringAngle * 0.15;
        ctx.save();
        ctx.rotate(a);
        ctx.fillStyle = i % 2 === 0 ? "#22384a" : "#1b2c3c";
        ctx.beginPath();
        ctx.moveTo(14, -6);
        ctx.lineTo(36, -20 + (1 - irisOpen) * 20);
        ctx.lineTo(39, 18 - (1 - irisOpen) * 14);
        ctx.lineTo(14, 7);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(120, 190, 230, 0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      const core = ctx.createRadialGradient(0, 0, 4, 0, 0, 46);
      core.addColorStop(0, "rgba(255, 255, 255, 0.98)");
      core.addColorStop(0.3, "rgba(150, 235, 255, 0.95)");
      core.addColorStop(0.7, "rgba(70, 130, 255, 0.55)");
      core.addColorStop(1, "rgba(40, 60, 160, 0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, (34 + Math.sin(b.t * 4) * 2) * (0.8 + irisOpen * 0.3), 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#16203a";
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(150, 230, 255, 0.6)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = "#d8fbff";
      ctx.beginPath();
      ctx.arc(-3, -3, 4, 0, Math.PI * 2);
      ctx.fill();

      if (b.phase >= 3) {
        ctx.strokeStyle = "rgba(170, 240, 255, 0.75)";
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 3; i += 1) {
          const a = b.t * 3 + i * 2.1;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 16, Math.sin(a) * 16);
          let r = 16;
          let angle = a;
          for (let k = 0; k < 3; k += 1) {
            r += 9;
            angle += Math.sin(b.t * 20 + i * 7 + k) * 0.5;
            ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
          }
          ctx.stroke();
        }
      }
    } else if (b.stage === 4) {
      // 「猎户座」质量投射器：月面环形山里的轨道炮平台，两条电磁导轨 + 旋转炮塔。
      ctx.save();
      ctx.rotate(Math.sin(b.t * 0.7) * 0.02);

      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.beginPath();
      ctx.ellipse(8, 20, 118, 54, 0, 0, Math.PI * 2);
      ctx.fill();

      // 底盘：采矿平台的六边形装甲板
      const plate = ctx.createLinearGradient(0, -46, 0, 52);
      plate.addColorStop(0, "#8f8574");
      plate.addColorStop(0.4, "#5d5648");
      plate.addColorStop(1, "#2b2721");
      ctx.fillStyle = plate;
      ctx.beginPath();
      ctx.moveTo(-104, -6);
      ctx.lineTo(-72, -40);
      ctx.lineTo(72, -40);
      ctx.lineTo(104, -6);
      ctx.lineTo(84, 42);
      ctx.lineTo(-84, 42);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 226, 122, 0.45)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // 履带行走机构
      for (const side of [-1, 1]) {
        ctx.fillStyle = "#211f1b";
        ctx.beginPath();
        ctx.roundRect(side * 66 - 26, 18, 52, 26, 12);
        ctx.fill();
        ctx.strokeStyle = "rgba(150, 142, 126, 0.35)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        for (let i = 0; i < 5; i += 1) {
          ctx.fillStyle = "rgba(160, 150, 130, 0.22)";
          ctx.fillRect(side * 66 - 22 + i * 10, 24, 5, 14);
        }
      }

      // 电磁导轨：两条加速轨道朝玩家方向伸出，充电时逐段亮起
      const charge = b.phase >= 3 ? 0.9 : b.phase >= 2 ? 0.6 : 0.35;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * 20, 2);
        ctx.fillStyle = "#3b3831";
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.lineTo(6, 70);
        ctx.lineTo(-6, 70);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 226, 122, 0.55)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        for (let i = 0; i < 6; i += 1) {
          const lit = ((Math.floor(b.t * 6) + i) % 6) / 6 < charge;
          ctx.fillStyle = lit ? "rgba(255, 236, 150, 0.95)" : "rgba(120, 110, 80, 0.5)";
          ctx.fillRect(-5.5, 10 + i * 9, 11, 5);
        }
        const muzzle = ctx.createRadialGradient(0, 72, 1, 0, 72, 13);
        muzzle.addColorStop(0, `rgba(255, 240, 180, ${0.35 + charge * 0.5})`);
        muzzle.addColorStop(1, "rgba(255, 190, 60, 0)");
        ctx.fillStyle = muzzle;
        ctx.beginPath();
        ctx.arc(0, 72, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 中央炮塔：随机型号 + 瞄准到玩家
      const turretAngle = Math.atan2(this.playerY - (b.y - 6), this.playerX - b.x) - Math.PI / 2;
      ctx.save();
      ctx.translate(0, -6);
      ctx.fillStyle = "#4a453c";
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 210, 120, 0.5)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.rotate(turretAngle);
      ctx.fillStyle = "#2e2b25";
      ctx.fillRect(-14, -8, 30, 16);
      ctx.fillStyle = "#6d6659";
      ctx.fillRect(8, -4.5, 26, 4);
      ctx.fillRect(8, 1.5, 26, 4);
      ctx.fillStyle = b.phase >= 2 ? "#ffe27a" : "#a08a4a";
      ctx.beginPath();
      ctx.arc(-2, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 侧面储能环：随自旋转动，相位越高转得越快
      ctx.save();
      ctx.rotate(b.spin);
      ctx.strokeStyle = "rgba(255, 190, 90, 0.6)";
      ctx.lineWidth = 3;
      ctx.setLineDash([20, 16]);
      ctx.beginPath();
      ctx.arc(0, 2, 74, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < 4; i += 1) {
        const a = (i * Math.PI) / 2;
        ctx.fillStyle = "#554f42";
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 74, 2 + Math.sin(a) * 74, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 220, 140, 0.85)";
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 74, 2 + Math.sin(a) * 74, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 散热鳍片与警示灯
      for (let i = 0; i < 5; i += 1) {
        ctx.fillStyle = i % 2 === 0 ? "#3e3a33" : "#4f4a40";
        ctx.fillRect(-58 + i * 26, -34, 16, 10);
      }
      const blink = Math.sin(b.t * 4.2) > 0.2;
      ctx.fillStyle = blink ? "rgba(255, 120, 70, 0.95)" : "rgba(110, 60, 30, 0.6)";
      ctx.beginPath();
      ctx.arc(0, 34, 3.6, 0, Math.PI * 2);
      ctx.fill();

      if (b.phase >= 2) {
        for (let i = 0; i < (b.phase >= 3 ? 4 : 2); i += 1) {
          const sx = Math.sin(b.t * 2.6 + i * 1.7) * 70;
          const sy = 30 + Math.cos(b.t * 2 + i) * 8;
          const spark = ctx.createRadialGradient(sx, sy, 1, sx, sy, 12);
          spark.addColorStop(0, "rgba(255, 240, 180, 0.6)");
          spark.addColorStop(1, "rgba(255, 180, 60, 0)");
          ctx.fillStyle = spark;
          ctx.beginPath();
          ctx.arc(sx, sy, 12, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    } else {
      // 天穹要塞「欧米伽」：三层装甲环 + 六座浮游炮 + 中央王座晶核
      ctx.save();
      ctx.rotate(b.spin * 0.4);
      ctx.strokeStyle = "rgba(215, 160, 255, 0.5)";
      ctx.lineWidth = 2.4;
      ctx.setLineDash([34, 20]);
      ctx.beginPath();
      ctx.arc(0, 0, 116, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      for (let i = 0; i < 6; i += 1) {
        const podAngle = b.ringAngle * 0.5 + (i * Math.PI) / 3;
        const px = Math.cos(podAngle) * 92;
        const py = Math.sin(podAngle) * 92;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(podAngle + Math.PI / 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.fillRect(-12, -6, 26, 20);
        const pod = ctx.createLinearGradient(0, -12, 0, 12);
        pod.addColorStop(0, "#7b5f9d");
        pod.addColorStop(0.5, "#3d2c56");
        pod.addColorStop(1, "#1c1430");
        ctx.fillStyle = pod;
        ctx.beginPath();
        ctx.moveTo(-13, -9);
        ctx.lineTo(9, -12);
        ctx.lineTo(18, 0);
        ctx.lineTo(9, 12);
        ctx.lineTo(-13, 9);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(215, 170, 255, 0.6)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = "#221634";
        ctx.fillRect(9, -5, 17, 3.4);
        ctx.fillRect(9, 1.6, 17, 3.4);
        const glow = b.phase >= 2 ? 0.95 : 0.5;
        ctx.fillStyle = `rgba(255, 150, 220, ${glow})`;
        ctx.beginPath();
        ctx.arc(-3, 0, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 要塞主体：八边形堡垒 + 内圈旋转装甲
      const hull = ctx.createLinearGradient(0, -60, 0, 60);
      hull.addColorStop(0, "#6a5a8c");
      hull.addColorStop(0.45, "#3a2b52");
      hull.addColorStop(1, "#150f26");
      ctx.fillStyle = hull;
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const a = (i * Math.PI) / 4 + Math.PI / 8;
        const rx = Math.cos(a) * 58;
        const ry = Math.sin(a) * 58;
        if (i === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(190, 150, 255, 0.6)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.rotate(-b.ringAngle * 0.8);
      ctx.strokeStyle = "rgba(150, 230, 255, 0.55)";
      ctx.lineWidth = 2.6;
      ctx.setLineDash([18, 14]);
      ctx.beginPath();
      ctx.arc(0, 0, 42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < 8; i += 1) {
        const a = (i * Math.PI) / 4;
        ctx.fillStyle = "#2a1f42";
        ctx.save();
        ctx.translate(Math.cos(a) * 42, Math.sin(a) * 42);
        ctx.rotate(a);
        ctx.fillRect(-5, -7, 10, 14);
        ctx.restore();
      }
      ctx.restore();

      // 王座晶核：随相位张开的光瞳
      const iris = b.phase >= 3 ? 0.85 : b.phase >= 2 ? 0.55 : 0.3;
      for (let i = 0; i < 8; i += 1) {
        const a = (i * Math.PI) / 4 + b.ringAngle * 0.2;
        ctx.save();
        ctx.rotate(a);
        ctx.fillStyle = i % 2 === 0 ? "#3b2a5c" : "#28203f";
        ctx.beginPath();
        ctx.moveTo(12, -6);
        ctx.lineTo(34, -22 + (1 - iris) * 22);
        ctx.lineTo(37, 16 - (1 - iris) * 16);
        ctx.lineTo(12, 7);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(180, 140, 240, 0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      const throne = ctx.createRadialGradient(0, 0, 3, 0, 0, 50);
      throne.addColorStop(0, "rgba(255, 255, 255, 0.98)");
      throne.addColorStop(0.28, "rgba(214, 170, 255, 0.95)");
      throne.addColorStop(0.65, "rgba(120, 70, 220, 0.55)");
      throne.addColorStop(1, "rgba(60, 20, 120, 0)");
      ctx.fillStyle = throne;
      ctx.beginPath();
      ctx.arc(0, 0, (30 + Math.sin(b.t * 3.4) * 2.4) * (0.85 + iris * 0.35), 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#1a0f2e";
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(215, 170, 255, 0.7)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = "#ffe9ff";
      ctx.beginPath();
      ctx.arc(-3, -3, 3.6, 0, Math.PI * 2);
      ctx.fill();

      if (b.phase >= 2) {
        // 要塞表面的能量裂纹，相位越高越多
        ctx.strokeStyle = "rgba(255, 170, 235, 0.6)";
        ctx.lineWidth = 1.2;
        const cracks = b.phase >= 3 ? 6 : 3;
        for (let i = 0; i < cracks; i += 1) {
          const a = (i * Math.PI * 2) / cracks + b.spin;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
          ctx.lineTo(Math.cos(a + 0.3) * 40, Math.sin(a + 0.3) * 40);
          ctx.lineTo(Math.cos(a - 0.15) * 56, Math.sin(a - 0.15) * 56);
          ctx.stroke();
        }
      }
    }

    if (b.flash > 0) {
      // 命中闪白用软边辉光，避免在大体积 Boss 上出现突兀的白色圆盘。
      const radius = b.stage === 1 ? 132 : b.stage === 2 ? 46 : b.stage === 3 ? 72 : b.stage === 4 ? 108 : 120;
      const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, radius);
      glow.addColorStop(0, `rgba(255, 255, 255, ${b.flash * 0.3})`);
      glow.addColorStop(0.45, `rgba(210, 245, 255, ${b.flash * 0.14})`);
      glow.addColorStop(1, "rgba(210, 245, 255, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 激光预警 / 光束
    for (const beam of b.beams) {
      if (beam.warn > 0) {
        const pulse = 0.25 + 0.3 * Math.abs(Math.sin(this.time * 18));
        ctx.strokeStyle = `rgba(255, 90, 120, ${pulse})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 10]);
        ctx.beginPath();
        ctx.moveTo(beam.x, 60);
        ctx.lineTo(beam.x, FIELD_H);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (beam.active > 0) {
        const alpha = Math.min(1, beam.active * 4);
        const grad = ctx.createLinearGradient(beam.x - 18, 0, beam.x + 18, 0);
        grad.addColorStop(0, "rgba(120, 210, 255, 0)");
        grad.addColorStop(0.5, `rgba(220, 250, 255, ${alpha * 0.95})`);
        grad.addColorStop(1, "rgba(120, 210, 255, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(beam.x - 18, 60, 36, FIELD_H - 60);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fillRect(beam.x - 3, 60, 6, FIELD_H - 60);
      }
    }
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const t = Math.max(0, p.life / p.maxLife);
      if (p.kind === "spark") {
        ctx.globalAlpha = t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        ctx.stroke();
      } else if (p.kind === "smoke") {
        ctx.globalAlpha = t * 0.32;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "debris") {
        ctx.save();
        ctx.globalAlpha = Math.min(1, t * 1.4);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot ?? 0);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size * 0.5, -p.size * 1.5, p.size, p.size * 3);
        ctx.restore();
      } else {
        ctx.globalAlpha = t * 0.7;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * t + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - t) * 0.8 + 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private createVignette(): HTMLCanvasElement | null {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = FIELD_W;
    canvas.height = FIELD_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const gradient = ctx.createRadialGradient(
      FIELD_W / 2,
      FIELD_H / 2,
      FIELD_H * 0.28,
      FIELD_W / 2,
      FIELD_H / 2,
      FIELD_H * 0.72,
    );
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.5)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    const top = ctx.createLinearGradient(0, 0, 0, 90);
    top.addColorStop(0, "rgba(0, 0, 0, 0.35)");
    top.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, FIELD_W, 90);
    return canvas;
  }

  /* ----------------------------- 输入 ----------------------------- */

  private toField(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * FIELD_W,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * FIELD_H,
    };
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (MOVE_KEYS.has(event.code) || event.code === "Space") event.preventDefault();
    if (event.repeat) return;
    this.audio.unlock();
    if (event.code === "KeyP" || event.code === "Escape") {
      if (this.state === "playing") this.togglePause();
      return;
    }
    if (event.code === "KeyX" || event.code === "KeyK" || event.code === "Space") {
      this.useBomb();
      return;
    }
    if (MOVE_KEYS.has(event.code)) this.keys.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private onPointerDown = (event: PointerEvent): void => {
    this.audio.unlock();
    if (this.state !== "playing" || this.paused) return;
    const point = this.toField(event);
    this.pointer = {
      active: true,
      id: event.pointerId,
      startX: point.x,
      startY: point.y,
      baseX: this.playerX,
      baseY: this.playerY,
      targetX: this.playerX,
      targetY: this.playerY,
      hasTarget: false,
    };
    this.canvas.setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.pointer.active || event.pointerId !== this.pointer.id) return;
    const point = this.toField(event);
    this.pointer.targetX = clamp(this.pointer.baseX + (point.x - this.pointer.startX) * 1.18, 22, FIELD_W - 22);
    this.pointer.targetY = clamp(this.pointer.baseY + (point.y - this.pointer.startY) * 1.18, 54, FIELD_H - 26);
    this.pointer.hasTarget = true;
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointer.id) return;
    this.pointer.active = false;
    this.pointer.hasTarget = false;
  };

  private onVisibility = (): void => {
    if (document.visibilityState === "hidden" && this.state === "playing" && !this.paused) {
      this.setPaused(true);
    }
  };

  private bindEvents(): void {
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  private unbindEvents(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    document.removeEventListener("visibilitychange", this.onVisibility);
  }
}
