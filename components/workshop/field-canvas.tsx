"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MapPin, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  WORKSHOP_DIR,
  fieldHitsSolid,
  fieldPointPixel,
  fieldSpeedAt,
  workshopFieldFor,
  type WorkshopField,
  type WorkshopFieldHotspot,
} from "@/lib/workshop/field";
import type { WorkshopWalkPath } from "@/lib/workshop/run";
import {
  DEFAULT_WORKSHOP_VIEW,
  makeWorkshopView,
  paintWorkshopField,
  type WorkshopFacing,
  type WorkshopView,
} from "./field-painter";

/**
 * 冒险地图的行走画面：一格一步，走位攒成游程路径交给服务端重放。
 *
 * 客户端只是「影子」：本地先按同一份纯函数生成的图动起来，攒够一段再把路径发上去；
 * 服务端算出的光标若与本地不一致（撞墙、摇中遇敌、走到上限收兵、请求被拒），
 * 一律以服务端为准拉回来。玩家能骗过本地的只有自己的屏幕，骗不过重放。
 */

export interface WorkshopWalkResult {
  kind: "ok" | "encounter" | "capped";
  tx: number;
  ty: number;
  steps: number;
  encounters: number;
  reason: "steps" | "encounters" | null;
}

interface WorkshopFieldCanvasProps {
  areaKey: string;
  seed: number;
  areaName: string;
  run: { tx: number; ty: number; steps: number; encounters: number };
  limits: { maxSteps: number; maxEncounters: number };
  badges: number;
  partyColor: string;
  partyAccent: string;
  /** 战斗中：不接受输入，也不发路径。 */
  locked: boolean;
  busy: boolean;
  onWalk: (path: WorkshopWalkPath) => Promise<WorkshopWalkResult | null>;
  onInteract: (kind: "camp" | "gym") => void;
  onLeave: () => void;
}

const STEP_MS = 150;
/** 攒够这么多步发一次：手机上跑满一屏也不会超过单次路径步数上限。 */
const FLUSH_STEPS = 24;
const FLUSH_MS = 700;

const FACING_INDEX: Record<WorkshopFacing, number> = { up: 0, right: 1, down: 2, left: 3 };

function hotspotAt(field: WorkshopField, tx: number, ty: number): WorkshopFieldHotspot {
  if (Math.abs(tx - field.camp.tx) <= 1 && Math.abs(ty - field.camp.ty) <= 1) return { kind: "camp" };
  if (Math.abs(tx - field.gym.tx) <= 1 && Math.abs(ty - field.gym.ty) <= 1) return { kind: "gym" };
  return null;
}

/**
 * 贪心路径：先走长轴再走短轴，两条轴都堵死就停下。
 * 不是最短路，但小径本来就是 `carveRoad` 顺着轴抖出来的，跟着走基本不会撞墙。
 */
function greedyPath(
  field: WorkshopField,
  fromTx: number,
  fromTy: number,
  toTx: number,
  toTy: number,
): WorkshopFacing[] {
  const canStep = (nx: number, ny: number): boolean => {
    if (nx < 0 || ny < 0 || nx >= field.cols || ny >= field.rows) return false;
    const { x, y } = fieldPointPixel(field, { tx: nx, ty: ny });
    return !fieldHitsSolid(field, x, y);
  };
  const path: WorkshopFacing[] = [];
  let tx = fromTx;
  let ty = fromTy;
  for (let guard = 0; guard < field.cols * field.rows && path.length < 64; guard += 1) {
    if (tx === toTx && ty === toTy) return path;
    const dx = Math.sign(toTx - tx);
    const dy = Math.sign(toTy - ty);
    const options: [number, number, WorkshopFacing][] = [];
    if (dx !== 0) options.push([tx + dx, ty, dx > 0 ? "right" : "left"]);
    if (dy !== 0) options.push([tx, ty + dy, dy > 0 ? "down" : "up"]);
    if (Math.abs(toTy - ty) > Math.abs(toTx - tx)) options.reverse();
    const moved = options.find(([nx, ny]) => canStep(nx, ny));
    if (!moved) return path;
    [tx, ty] = moved;
    path.push(moved[2]);
  }
  return path;
}

export function WorkshopFieldCanvas(props: WorkshopFieldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<WorkshopView>(DEFAULT_WORKSHOP_VIEW);
  const scaleRef = useRef(1);
  const field = workshopFieldFor(props.areaKey, props.seed);

  /** 服务端认可过的光标：本地预测与它不一致时以它为准。 */
  const anchorRef = useRef({ tx: props.run.tx, ty: props.run.ty, steps: props.run.steps, encounters: props.run.encounters });
  const seedRef = useRef(props.seed);
  const cursorRef = useRef({ tx: props.run.tx, ty: props.run.ty });
  const facingRef = useRef<WorkshopFacing>("down");
  const hopRef = useRef<{ fromX: number; fromY: number; dx: number; dy: number; t: number } | null>(null);
  const pendingRef = useRef<WorkshopWalkPath>([]);
  const keysRef = useRef({ up: false, down: false, left: false, right: false });
  const queueRef = useRef<WorkshopFacing[]>([]);
  const hotspotRef = useRef<WorkshopFieldHotspot>(null);
  const countsRef = useRef({ steps: props.run.steps, encounters: props.run.encounters });
  const hudRef = useRef({ areaName: props.areaName, badges: props.badges, partyColor: props.partyColor, partyAccent: props.partyAccent });
  const limitsRef = useRef(props.limits);
  const lockedRef = useRef(props.locked);
  const onWalkRef = useRef(props.onWalk);
  const onInteractRef = useRef(props.onInteract);
  const [hud, setHud] = useState({ steps: props.run.steps, encounters: props.run.encounters });

  const applyRun = useCallback(
    (run: { tx: number; ty: number; steps: number; encounters: number }) => {
      anchorRef.current = { tx: run.tx, ty: run.ty, steps: run.steps, encounters: run.encounters };
      cursorRef.current = { tx: run.tx, ty: run.ty };
      countsRef.current = { steps: run.steps, encounters: run.encounters };
      hopRef.current = null;
      queueRef.current = [];
      setHud({ steps: run.steps, encounters: run.encounters });
    },
    [],
  );

  useEffect(() => {
    lockedRef.current = props.locked;
    onWalkRef.current = props.onWalk;
    onInteractRef.current = props.onInteract;
    limitsRef.current = props.limits;
    hudRef.current = {
      areaName: props.areaName,
      badges: props.badges,
      partyColor: props.partyColor,
      partyAccent: props.partyAccent,
    };
  }, [
    props.locked,
    props.onWalk,
    props.onInteract,
    props.limits,
    props.areaName,
    props.badges,
    props.partyColor,
    props.partyAccent,
  ]);

  useEffect(() => {
    const anchor = anchorRef.current;
    // 与服务端一致就什么都不做：刚被 flush 确认过的位置不该打断正在播的走位
    if (
      props.seed === seedRef.current &&
      anchor.tx === props.run.tx &&
      anchor.ty === props.run.ty &&
      anchor.steps === props.run.steps &&
      anchor.encounters === props.run.encounters
    ) {
      return;
    }
    seedRef.current = props.seed;
    applyRun(props.run);
    pendingRef.current = [];
  }, [props.seed, props.run, applyRun]);

  /** 把攒下的路径交给服务端重放；失败就把主角拉回服务端上次认可的位置。 */
  const flush = useCallback(async (): Promise<WorkshopWalkResult | null> => {
    const path = pendingRef.current;
    if (path.length === 0) return null;
    pendingRef.current = [];
    const result = await onWalkRef.current(path);
    if (!result) {
      cursorRef.current = { tx: anchorRef.current.tx, ty: anchorRef.current.ty };
      return null;
    }
    applyRun(result);
    return result;
  }, [applyRun]);

  // ---- 画布尺寸：位图按 CSS 宽 × devicePixelRatio 放大，逻辑高跟着画布比例走 ----
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const sync = () => {
      const cssWidth = wrap.clientWidth || DEFAULT_WORKSHOP_VIEW.w;
      const dpr = window.devicePixelRatio || 1;
      const scale = Math.max(1, Math.min(2, dpr * (cssWidth / DEFAULT_WORKSHOP_VIEW.w)));
      const wantedHeight =
        cssWidth < 640
          ? Math.min((cssWidth * 4) / 3, window.innerHeight * 0.42)
          : (cssWidth * 9) / 16;
      const view = makeWorkshopView((wantedHeight / cssWidth) * DEFAULT_WORKSHOP_VIEW.w);
      const w = Math.round(view.w * scale);
      const h = Math.round(view.h * scale);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      // CSS 高度按视野比例给，逻辑像素与屏幕像素同比例才不会拉伸
      const cssHeight = `${Math.round((cssWidth * view.h) / view.w)}px`;
      if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
      viewRef.current = view;
      scaleRef.current = scale;
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  // ---- 键盘 ----
  useEffect(() => {
    const setKey = (key: string, pressed: boolean): boolean => {
      if (key === "arrowup" || key === "w") keysRef.current.up = pressed;
      else if (key === "arrowdown" || key === "s") keysRef.current.down = pressed;
      else if (key === "arrowleft" || key === "a") keysRef.current.left = pressed;
      else if (key === "arrowright" || key === "d") keysRef.current.right = pressed;
      else return false;
      return true;
    };
    const down = (event: KeyboardEvent) => {
      const k = event.key.toLowerCase();
      if ((k === "e" || k === "enter") && !event.repeat) {
        const spot = hotspotRef.current;
        if (spot && !lockedRef.current) onInteractRef.current(spot.kind);
        return;
      }
      if (setKey(k, true)) {
        event.preventDefault();
        queueRef.current = [];
      }
    };
    const up = (event: KeyboardEvent) => {
      setKey(event.key.toLowerCase(), false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ---- 主循环：一格一步的走位 + 绘制 ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const start = performance.now();
    let raf = 0;
    let prev = 0;
    let lastFlush = 0;

    const keyFacing = (): WorkshopFacing | null => {
      const keys = keysRef.current;
      if (keys.up) return "up";
      if (keys.down) return "down";
      if (keys.left) return "left";
      if (keys.right) return "right";
      return null;
    };

    /** 起一步：走得动就移动光标、记下动画、把这一步计入待上传的路径。 */
    const beginStep = (facing: WorkshopFacing): boolean => {
      const dir = WORKSHOP_DIR[FACING_INDEX[facing]];
      const cursor = cursorRef.current;
      const nx = cursor.tx + dir.dx;
      const ny = cursor.ty + dir.dy;
      if (nx < 0 || ny < 0 || nx >= field.cols || ny >= field.rows) return false;
      const { x, y } = fieldPointPixel(field, { tx: nx, ty: ny });
      if (fieldHitsSolid(field, x, y)) return false;
      cursorRef.current = { tx: nx, ty: ny };
      facingRef.current = facing;
      hopRef.current = {
        fromX: (cursor.tx + 0.5) * field.tile,
        fromY: (cursor.ty + 1) * field.tile,
        dx: dir.dx,
        dy: dir.dy,
        t: 0,
      };
      const last = pendingRef.current[pendingRef.current.length - 1];
      if (last && last[0] === FACING_INDEX[facing]) last[1] += 1;
      else pendingRef.current.push([FACING_INDEX[facing], 1]);
      return true;
    };

    const frame = (nowMs: number) => {
      const elapsed = nowMs - start;
      const dt = Math.min(64, elapsed - prev);
      prev = elapsed;
      const time = elapsed / 1000;

      if (lockedRef.current) {
        hopRef.current = null;
      } else {
        if (!hopRef.current) {
          const held = keyFacing();
          const facing = held ?? queueRef.current.shift() ?? null;
          if (facing && !beginStep(facing)) queueRef.current = [];
        } else {
          const hop = hopRef.current;
          const speed = fieldSpeedAt(field, hop.fromX, hop.fromY) || 1;
          hop.t += (dt / STEP_MS) * speed;
          if (hop.t >= 1) hopRef.current = null;
        }
        if (pendingRef.current.length > 0) {
          const total = pendingRef.current.reduce((sum, run) => sum + run[1], 0);
          if (total >= FLUSH_STEPS || elapsed - lastFlush > FLUSH_MS) {
            lastFlush = elapsed;
            void flush();
          }
        }
      }

      const cursor = cursorRef.current;
      const hop = hopRef.current;
      const center = fieldPointPixel(field, cursor);
      const restY = (cursor.ty + 1) * field.tile;
      const x = hop ? hop.fromX + hop.dx * field.tile * hop.t : center.x;
      const y = hop ? hop.fromY + hop.dy * field.tile * hop.t : restY;

      const spot = hotspotAt(field, cursor.tx, cursor.ty);
      hotspotRef.current = spot;

      const limits = limitsRef.current;
      const counts = countsRef.current;
      ctx.setTransform(scaleRef.current, 0, 0, scaleRef.current, 0, 0);
      paintWorkshopField(ctx, {
        field,
        view: viewRef.current,
        time,
        x,
        y,
        facing: facingRef.current,
        moving: Boolean(hop),
        hotspot: spot,
        prompt: spot ? (spot.kind === "camp" ? "按 E 回营地" : "按 E 挑战道馆") : null,
        areaName: hudRef.current.areaName,
        stepsLeft: Math.max(0, limits.maxSteps - counts.steps),
        encountersLeft: Math.max(0, limits.maxEncounters - counts.encounters),
        partyColor: hudRef.current.partyColor,
        partyAccent: hudRef.current.partyAccent,
        badges: hudRef.current.badges,
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (pendingRef.current.length > 0) void flush();
    };
  }, [field, flush]);

  const tapWalk = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (props.locked) return;
    const view = viewRef.current;
    const rect = event.currentTarget.getBoundingClientRect();
    const cursor = cursorRef.current;
    const camX = Math.max(0, Math.min(field.worldW - view.w, (cursor.tx + 0.5) * field.tile - view.w / 2));
    const camY = Math.max(0, Math.min(field.worldH - view.h, (cursor.ty + 1) * field.tile - view.h / 2));
    const wx = (event.clientX - rect.left) * (view.w / rect.width) + camX;
    const wy = (event.clientY - rect.top) * (view.h / rect.height) + camY;
    const tx = Math.max(0, Math.min(field.cols - 1, Math.floor(wx / field.tile)));
    const ty = Math.max(0, Math.min(field.rows - 1, Math.floor(wy / field.tile)));
    const spot = hotspotAt(field, tx, ty);
    if (spot) {
      props.onInteract(spot.kind);
      return;
    }
    queueRef.current = greedyPath(field, cursor.tx, cursor.ty, tx, ty);
    keysRef.current = { up: false, down: false, left: false, right: false };
  };

  const stepsLeft = Math.max(0, props.limits.maxSteps - hud.steps);
  const encountersLeft = Math.max(0, props.limits.maxEncounters - hud.encounters);
  const exhausted = stepsLeft <= 0 || encountersLeft <= 0;
  const spot = hotspotAt(field, props.run.tx, props.run.ty);

  return (
    <div className="space-y-2">
      <div
        ref={wrapRef}
        className="relative -mx-5 overflow-hidden border-y border-border bg-black sm:mx-0 sm:rounded-xl sm:border"
      >
        <canvas
          ref={canvasRef}
          width={DEFAULT_WORKSHOP_VIEW.w}
          height={DEFAULT_WORKSHOP_VIEW.h}
          className="block w-full cursor-pointer touch-none"
          onClick={tapWalk}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="grid grid-flow-col grid-rows-2 gap-1">
          <DirButton label="↑" className="col-start-2 row-start-1" onPress={() => queueRef.current.unshift("up")} />
          <DirButton label="←" className="col-start-1 row-start-2" onPress={() => queueRef.current.unshift("left")} />
          <DirButton label="↓" className="col-start-2 row-start-2" onPress={() => queueRef.current.unshift("down")} />
          <DirButton label="→" className="col-start-3 row-start-2" onPress={() => queueRef.current.unshift("right")} />
        </div>
        {spot ? (
          <Button type="button" size="sm" disabled={props.locked} onClick={() => props.onInteract(spot.kind)}>
            <MapPin className="h-3.5 w-3.5" />
            {spot.kind === "camp" ? "回营地" : "挑战道馆"}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" disabled={props.busy} onClick={props.onLeave}>
          {props.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingDown className="h-3.5 w-3.5" />}
          收兵离开
        </Button>
        <p className="ml-auto text-xs text-muted-foreground">
          {exhausted
            ? "这趟已经走到头了，收兵回营地吧"
            : `已走 ${hud.steps} 步 · 遇敌 ${hud.encounters} 次`}
        </p>
      </div>
    </div>
  );
}

function DirButton({
  label,
  className,
  onPress,
}: {
  label: string;
  className?: string;
  onPress: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn("h-8 w-8 p-0 text-sm", className)}
      onPointerDown={(event) => {
        event.preventDefault();
        onPress();
      }}
    >
      {label}
    </Button>
  );
}
