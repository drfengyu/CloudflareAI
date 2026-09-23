"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCredits } from "@/lib/billing/credits";
import { toast } from "sonner";
import { buyTickets, drawLottery } from "./actions";
import type { ActivityStatus, DrawOutcome } from "@/lib/lottery/prize-math";

/** 外沿还有两道发光环，viewBox 要比最大半径留出这点余量，否则环带会被裁掉。 */
const SIZE = 400;
const C = SIZE / 2;
/** 外圈环形带、内圈盘面、中心轴三层的半径。入口指针会从内圈一直伸进外圈带。 */
const OUTER_R = 182;
const OUTER_IN = 144;
const INNER_R = 136;
const HUB_R = 34;
const SPOKE_BASE = 20;

const SPIN_INNER_MS = 2600;
const SPIN_OUTER_MS = 1500;
const SPOKE_STEP_MS = 130;

type Tone = "positive" | "negative" | "zero" | "entry" | "ticket";

/** 内圈的一个扇区（奖品或「外圈入口」），`weight` 决定扇区角度，与实际概率同源。 */
export interface WheelSector {
  kind: "prize" | "entry";
  label: string;
  tone: Tone;
  /** 归一化权重，内圈所有扇区合计 100。 */
  weight: number;
  /** 真实中奖概率（%），等于 weight。 */
  chance: number;
}

/** 外圈的一个奖品扇区。 */
export interface WheelOuter {
  label: string;
  batchLabel?: string;
  tone: Tone;
  /** 外圈环带内的权重占比（%），同时就是该格子在中奖后的条件概率。 */
  weight: number;
  /** 摊到整圈的真实概率（%）= weight × 外圈概率。 */
  chance: number;
}

export interface LotteryWheelProps {
  innerSectors: WheelSector[];
  outerPrizes: WheelOuter[];
  ticketPriceCredits: number;
  outerChancePercent: number;
  prizeValidDays: number;
  milestones: { draws: number; tickets: number }[];
  tickets: number;
  totalDraws: number;
  totalCredits: number;
  status: ActivityStatus;
  startAtMs: number | null;
  endAtMs: number | null;
}

/** 霓虹配色：每个音调给深浅两档交替，相邻扇区才分得开。赠券档用金色与 cr 档区分。 */
const NEON: Record<Tone, [string, string]> = {
  positive: ["#22d3ee", "#0b7285"],
  negative: ["#fb7185", "#8f1d3f"],
  zero: ["#64748b", "#3b4757"],
  entry: ["#c084fc", "#6b21a8"],
  ticket: ["#fbbf24", "#7c4a03"],
};

const PANEL = "radial-gradient(circle at 50% 38%, #1a2445 0%, #0a0f22 55%, #05070f 100%)";

function polar(r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) };
}

function annulusSector(rOut: number, rIn: number, start: number, end: number) {
  const large = end - start > 180 ? 1 : 0;
  const a = polar(rOut, start);
  const b = polar(rOut, end);
  const c = polar(rIn, end);
  const d = polar(rIn, start);
  return `M ${a.x} ${a.y} A ${rOut} ${rOut} 0 ${large} 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${rIn} ${rIn} 0 ${large} 0 ${d.x} ${d.y} Z`;
}

function discSector(r: number, start: number, end: number) {
  const large = end - start > 180 ? 1 : 0;
  const a = polar(r, start);
  const b = polar(r, end);
  return `M ${C} ${C} L ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y} Z`;
}

/** 按权重把 360° 切成扇区，角度以「12 点方向为 0、顺时针」计。 */
function spans(weights: number[]) {
  const total = weights.reduce((sum, w) => sum + w, 0) || 1;
  let acc = 0;
  return weights.map((w) => {
    const start = (acc / total) * 360;
    acc += w;
    const end = (acc / total) * 360;
    return { start, end, center: (start + end) / 2 };
  });
}

function sectorPaint(tone: Tone, index: number) {
  const pair = NEON[tone];
  return { fill: pair[index % 2], fillOpacity: index % 2 === 0 ? 0.95 : 0.68 };
}

/** 标签切向排布，落点半径处的弧长就是它能占到的宽度。 */
function arcAt(r: number, span: { start: number; end: number }) {
  return ((span.end - span.start) * Math.PI * r) / 180;
}

/**
 * 字号按「可用弧长 ÷ 标签宽度」收缩，缩到 7.5 以下就整段不画：外圈 1% 上下的格子只有
 * 两三度，"+1250 cr" 硬画会压到邻居格子的标签上。这类档位的文案与概率在下方「奖池与规则」全量公示。
 */
function labelSize(r: number, span: { start: number; end: number }, label: string, base: number) {
  const size = Math.min(base, arcAt(r, span) / (Math.max(1, label.length) * 0.55));
  return size >= 7.5 ? size : null;
}

/** 让目标扇区中心转到某个角度处，且始终往前转（不倒着回去）。 */
function rotationTo(current: number, sectorCenter: number, targetAngle: number, turns: number) {
  const desired = ((targetAngle - sectorCenter) % 360 + 360) % 360;
  const floor = current - (((current % 360) + 360) % 360);
  let next = floor + turns * 360 + desired;
  if (next <= current) next += 360;
  return next;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "0 分";
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days} 天 ${hours} 时`;
  if (hours > 0) return `${hours} 时 ${minutes % 60} 分`;
  return `${minutes} 分`;
}

export function LotteryWheel(props: LotteryWheelProps) {
  const router = useRouter();
  const [innerRotation, setInnerRotation] = useState(0);
  const [outerRotation, setOuterRotation] = useState(0);
  const [phase, setPhase] = useState<"idle" | "inner" | "outer" | "done">("idle");
  const [tickets, setTickets] = useState(props.tickets);
  const [spokes, setSpokes] = useState<DrawOutcome[]>([]);
  const [results, setResults] = useState<DrawOutcome[] | null>(null);
  const [buyCount, setBuyCount] = useState(10);
  const [buying, setBuying] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timers = useRef<number[]>([]);

  const active = props.status === "active";
  const busy = phase === "inner" || phase === "outer";
  const innerSectorSpans = useMemo(
    () => spans(props.innerSectors.map((s) => s.weight)),
    [props.innerSectors],
  );
  const outerSpans = useMemo(() => spans(props.outerPrizes.map((p) => p.weight)), [props.outerPrizes]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach((id) => clearTimeout(id));
    },
    [],
  );

  function later(fn: () => void, ms: number) {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  }

  async function handleDraw(count: 1 | 10) {
    if (busy) return;
    if (tickets < count) {
      toast.error(`抽奖券不足，本次需要 ${count} 张`);
      return;
    }
    timers.current.forEach((id) => clearTimeout(id));
    timers.current = [];
    setPhase("inner");
    setResults(null);
    setSpokes([]);

    const response = await drawLottery(count);
    if (!response.success) {
      setPhase("idle");
      toast.error(response.error);
      router.refresh();
      return;
    }

    const drawn = response.data.results;
    setResults(drawn);
    setTickets(response.data.ticketsLeft);

    // 内圈：把最后一次的落点转到顶部指针处。
    const last = drawn[drawn.length - 1];
    const lastSpan = innerSectorSpans[last.innerIndex] ?? innerSectorSpans[0];
    setInnerRotation((current) => rotationTo(current, lastSpan.center, 0, 5));

    const revealStart = SPIN_INNER_MS;
    drawn.forEach((result, index) => {
      later(() => {
        setSpokes((prev) => [...prev, result]);
      }, revealStart + index * SPOKE_STEP_MS);
    });

    // 入口落点：指针变长伸进外圈，外圈再转一次把对应奖品转到这根指针下。
    const entry = [...drawn].reverse().find((r) => r.outerIndex !== null);
    const spokesDone = revealStart + drawn.length * SPOKE_STEP_MS;
    if (entry) {
      later(() => {
        setPhase("outer");
        const entrySpan = innerSectorSpans[entry.innerIndex] ?? innerSectorSpans[0];
        const outerSpan = outerSpans[entry.outerIndex ?? 0];
        setOuterRotation((current) =>
          rotationTo(current, outerSpan.center, entrySpan.center, 3),
        );
      }, spokesDone + 120);
      later(() => setPhase("done"), spokesDone + 120 + SPIN_OUTER_MS);
    } else {
      later(() => setPhase("done"), spokesDone);
    }

    if (response.data.prizeTickets > 0) {
      later(
        () => toast.success(`抽中 ${response.data.prizeTickets} 张抽奖券，已放进券包`),
        spokesDone,
      );
    }
    if (response.data.giftedTickets > 0) {
      later(
        () => toast.success(`累抽达标，赠送 ${response.data.giftedTickets} 张抽奖券`),
        spokesDone + 240,
      );
    }
    later(() => router.refresh(), spokesDone);
  }

  async function handleBuy() {
    if (buying) return;
    setBuying(true);
    const response = await buyTickets(buyCount);
    setBuying(false);
    if (!response.success) {
      toast.error(response.error);
      router.refresh();
      return;
    }
    setTickets(response.data.ticketsLeft);
    toast.success(`已购买 ${response.data.tickets} 张抽奖券，扣 ${response.data.costCredits} cr`);
    router.refresh();
  }

  const netCredits = results ? results.reduce((sum, r) => sum + r.credits, 0) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
      <Card className="overflow-hidden border-white/10 bg-transparent p-0">
        <div style={{ background: PANEL }} className="px-5 pb-5 pt-4">
          <div className="flex items-center justify-between text-white/90">
            <div>
              <p className="text-sm font-semibold tracking-[0.18em]">LUCKY WHEEL</p>
              <p className="text-[11px] text-white/45">
                {active && props.endAtMs
                  ? `距结束 ${formatCountdown(props.endAtMs - now)}`
                  : props.status === "pending" && props.startAtMs
                    ? `将于 ${new Date(props.startAtMs).toLocaleString("zh-CN")} 开始`
                    : "活动窗口由管理员在系统设置中配置"}
              </p>
            </div>
            <StatusBadge status={props.status} />
          </div>

          <div className="relative mx-auto mt-3 w-full max-w-[520px]">
            {/* 顶部固定指针：内圈落点停在这里 */}
            <div className="absolute left-1/2 top-1 z-20 -translate-x-1/2">
              <div
                className="h-0 w-0 border-x-[11px] border-t-[22px] border-x-transparent"
                style={{ borderTopColor: "#f0f9ff", filter: "drop-shadow(0 0 6px #22d3ee)" }}
              />
            </div>
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full">
              <defs>
                <filter id="neon-glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="3.4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <radialGradient id="hub-gradient" cx="50%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#1e293b" />
                  <stop offset="100%" stopColor="#020617" />
                </radialGradient>
              </defs>

              <circle cx={C} cy={C} r={OUTER_R + 6} fill="none" stroke="#22d3ee" strokeOpacity={0.35} strokeWidth={2} filter="url(#neon-glow)" />
              <circle cx={C} cy={C} r={OUTER_R + 12} fill="none" stroke="#a855f7" strokeOpacity={0.18} strokeWidth={1} />

              {/* 外圈环带：只有从入口进来才会转这一层 */}
              <g
                style={{
                  transform: `rotate(${innerRotation + outerRotation}deg)`,
                  transformOrigin: "50% 50%",
                  transition: `transform ${SPIN_OUTER_MS}ms cubic-bezier(0.16, 0.9, 0.2, 1)`,
                }}
              >
                {props.outerPrizes.map((prize, index) => {
                  const span = outerSpans[index];
                  const midR = (OUTER_R + OUTER_IN) / 2;
                  const anchor = polar(prize.batchLabel ? midR + 8 : midR, span.center);
                  const batchAnchor = polar(midR - 9, span.center);
                  const size = labelSize(midR, span, prize.label, 11);
                  const batchSize = prize.batchLabel
                    ? labelSize(midR - 9, span, `10连 ${prize.batchLabel}`, 9)
                    : null;
                  return (
                    <g key={`outer-${index}`}>
                      <path
                        d={annulusSector(OUTER_R, OUTER_IN, span.start, span.end)}
                        {...sectorPaint(prize.tone, index)}
                        stroke="#05070f"
                        strokeWidth={2}
                      />
                      {size !== null && (
                        <text
                          x={anchor.x}
                          y={anchor.y}
                          transform={`rotate(${span.center} ${anchor.x} ${anchor.y})`}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#f8fafc"
                          fontSize={size}
                          fontWeight={600}
                        >
                          {prize.label}
                        </text>
                      )}
                      {prize.batchLabel && batchSize !== null && (
                        <text
                          x={batchAnchor.x}
                          y={batchAnchor.y}
                          transform={`rotate(${span.center} ${batchAnchor.x} ${batchAnchor.y})`}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#e2e8f0"
                          fillOpacity={0.65}
                          fontSize={batchSize}
                        >
                          10连 {prize.batchLabel}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>

              <circle cx={C} cy={C} r={OUTER_IN - 3} fill="none" stroke="#05070f" strokeWidth={6} />

              {/* 内圈盘面 */}
              <g
                style={{
                  transform: `rotate(${innerRotation}deg)`,
                  transformOrigin: "50% 50%",
                  transition: `transform ${SPIN_INNER_MS}ms cubic-bezier(0.16, 0.9, 0.2, 1)`,
                }}
              >
                {props.innerSectors.map((sector, index) => {
                  const span = innerSectorSpans[index];
                  const anchor = polar(INNER_R * 0.63, span.center);
                  const near = polar(INNER_R * 0.32, span.center);
                  const tone: Tone = sector.tone;
                  const size = labelSize(
                    INNER_R * 0.63,
                    span,
                    sector.label,
                    sector.kind === "entry" ? 12 : 11,
                  );
                  const hintSize = labelSize(INNER_R * 0.32, span, "↓ 外圈", 10);
                  return (
                    <g key={`inner-${index}`}>
                      <path
                        d={discSector(INNER_R, span.start, span.end)}
                        {...sectorPaint(tone, index)}
                        stroke="#05070f"
                        strokeWidth={2}
                      />
                      {size !== null && (
                        <text
                          x={anchor.x}
                          y={anchor.y}
                          transform={`rotate(${span.center} ${anchor.x} ${anchor.y})`}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={sector.kind === "entry" ? "#faf5ff" : "#f8fafc"}
                          fontSize={size}
                          fontWeight={700}
                        >
                          {sector.label}
                        </text>
                      )}
                      {sector.kind === "entry" && hintSize !== null && (
                        <text
                          x={near.x}
                          y={near.y}
                          transform={`rotate(${span.center} ${near.x} ${near.y})`}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#faf5ff"
                          fillOpacity={0.8}
                          fontSize={hintSize}
                        >
                          ↓ 外圈
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* 结果指针：内圈落点画短线，走通外圈的入口画长线伸进环带 */}
                {spokes.map((spoke) => {
                  const span = innerSectorSpans[spoke.innerIndex] ?? innerSectorSpans[0];
                  const reachesOuter = spoke.outerIndex !== null;
                  const tip = polar(reachesOuter ? OUTER_R - 4 : INNER_R - 6, span.center);
                  const base = polar(SPOKE_BASE, span.center);
                  return (
                    <g
                      key={`spoke-${spoke.seq}`}
                      style={{
                        animation: "lottery-spoke-in 320ms ease-out",
                        transformOrigin: `${C}px ${C}px`,
                      }}
                    >
                      <line
                        x1={base.x}
                        y1={base.y}
                        x2={tip.x}
                        y2={tip.y}
                        stroke={reachesOuter ? "#f0abfc" : "#f0f9ff"}
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeDasharray={
                          reachesOuter && spoke.seq !== lastEntrySeq(spokes) ? "5 4" : undefined
                        }
                        filter="url(#neon-glow)"
                      />
                      <circle cx={tip.x} cy={tip.y} r={4} fill={reachesOuter ? "#f0abfc" : "#22d3ee"} />
                    </g>
                  );
                })}
              </g>

              <circle cx={C} cy={C} r={HUB_R} fill="url(#hub-gradient)" stroke="#22d3ee" strokeOpacity={0.6} strokeWidth={1.5} />
              <text x={C} y={C - 3} textAnchor="middle" fill="#f8fafc" fontSize={16} fontWeight={700}>
                {tickets}
              </text>
              <text x={C} y={C + 14} textAnchor="middle" fill="#94a3b8" fontSize={9}>
                张券
              </text>
            </svg>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => handleDraw(1)}
              disabled={!active || busy || tickets < 1}
              className="h-11 rounded-lg bg-cyan-400 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "开奖中…" : `抽 1 次（${tickets} 券）`}
            </button>
            <button
              onClick={() => handleDraw(10)}
              disabled={!active || busy || tickets < 10}
              className="h-11 rounded-lg border border-fuchsia-400/70 text-sm font-semibold text-fuchsia-200 transition hover:bg-fuchsia-400/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "开奖中…" : "抽 10 次"}
            </button>
          </div>

          <div className="mt-3 flex items-end gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex-1">
              <label className="text-[11px] text-white/50" htmlFor="lottery-buy-count">
                购买抽奖券（{props.ticketPriceCredits} cr / 张）
              </label>
              <input
                id="lottery-buy-count"
                type="number"
                min={1}
                max={100}
                value={buyCount}
                onChange={(e) => setBuyCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                className="mt-1 h-8 w-full rounded border border-white/15 bg-slate-950/60 px-2 text-sm text-white outline-none focus:border-cyan-400"
              />
            </div>
            <button
              onClick={handleBuy}
              disabled={!active || buying}
              className="h-8 shrink-0 rounded bg-white/10 px-3 text-xs font-medium text-white transition hover:bg-white/20 disabled:opacity-40"
            >
              {buying ? "…" : `买 ${buyCount} 张`}
            </button>
            <div className="flex shrink-0 gap-1.5 pb-1">
              {[1, 10, 50].map((n) => (
                <button
                  key={n}
                  onClick={() => setBuyCount(n)}
                  className={cn(
                    "rounded border px-2 py-0.5 text-[11px] transition",
                    buyCount === n
                      ? "border-cyan-400 text-cyan-300"
                      : "border-white/15 text-white/50 hover:text-white",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">本次结果</CardTitle>
          </CardHeader>
          <CardContent>
            {!results ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {active ? "点击左侧按钮开始抽奖" : "活动未在进行中"}
              </p>
            ) : (
              <div className="space-y-2">
                <div
                  className={cn(
                    "flex items-baseline justify-between rounded-md px-3 py-2 text-sm",
                    netCredits >= 0 ? "bg-[color:var(--primary)]/10" : "bg-[color:var(--destructive)]/10",
                  )}
                >
                  <span className="text-muted-foreground">
                    {results.length} 次合计
                    {spokes.length < results.length ? "（开奖中…）" : ""}
                  </span>
                  <span className="text-lg font-semibold">
                    {netCredits >= 0 ? "+" : ""}
                    {formatCredits(netCredits)} cr
                  </span>
                </div>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {results.slice(0, Math.max(spokes.length, 1)).map((r) => (
                    <li
                      key={r.seq}
                      className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-xs"
                    >
                      <Badge tone={r.ring === "outer" ? "accent" : "muted"} className="text-[10px]">
                        {r.ring === "outer" ? "外圈" : "内圈"}
                      </Badge>
                      <span
                        className={cn(
                          "font-medium",
                          r.credits > 0
                            ? "text-[color:var(--primary)]"
                            : r.credits < 0
                              ? "text-[color:var(--destructive)]"
                              : "text-muted-foreground",
                        )}
                      >
                        {r.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">奖池与规则</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted-foreground">
            <div>
              <p className="mb-1 font-medium text-foreground">
                内圈（奖品合计 {(100 - props.outerChancePercent).toFixed(1)}% + 外圈入口{" "}
                {props.outerChancePercent}%）
              </p>
              <ul className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                {props.innerSectors.map((s, i) => (
                  <li
                    key={`ri-${i}`}
                    className={cn(
                      "rounded px-2 py-1 text-center",
                      s.kind === "entry" ? "bg-[color:var(--primary)]/15 font-medium" : "bg-muted/40",
                    )}
                  >
                    {s.label}
                    <span className="block text-[10px]">{s.chance.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-medium text-foreground">外圈（只有从入口进来才抽这一圈）</p>
              <ul className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                {props.outerPrizes.map((p, i) => (
                  <li key={`ro-${i}`} className="rounded bg-muted/40 px-2 py-1 text-center">
                    <span className="block">单抽 {p.label}</span>
                    <span className="block">{p.batchLabel ? `10连 ${p.batchLabel}` : "10连 同上"}</span>
                    <span className="block text-[10px]">{p.chance.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-medium text-foreground">累抽送券</p>
              <ul className="flex flex-wrap gap-1.5">
                {props.milestones.length === 0 ? (
                  <li>本活动未配置累抽档位</li>
                ) : (
                  props.milestones.map((m) => (
                    <li key={m.draws} className="rounded bg-muted/40 px-2 py-1">
                      累计 {m.draws} 次送 {m.tickets} 张
                    </li>
                  ))
                )}
              </ul>
            </div>
            <ul className="list-disc space-y-1 pl-4">
              <li>内圈指针停在「外圈入口」时指针变长，外圈再转一次决定最终结果。</li>
              <li>10 连抽一次转停后依次落 10 根指针；外圈只按最后一次进入的落点对位，其余入口结果见右侧明细。</li>
              <li>中奖 cr 作为临时余额发放，有效期 {props.prizeValidDays} 天，过期未用自动消失。</li>
              <li>转到倒扣时直接从永久余额扣除，可能扣成负数，请量力参与。</li>
              <li>活动结束后未使用的券作废，不折算回 cr。</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">我的战绩</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-lg font-semibold">{props.totalDraws}</p>
              <p className="text-xs text-muted-foreground">累计抽奖</p>
            </div>
            <div>
              <p className="text-lg font-semibold">{tickets}</p>
              <p className="text-xs text-muted-foreground">可用券</p>
            </div>
            <div>
              <p className="text-lg font-semibold">{formatCredits(props.totalCredits)} cr</p>
              <p className="text-xs text-muted-foreground">总余额</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** 多根入口指针时，只有最后一根与外圈精确对位，其余画虚线示意。 */
function lastEntrySeq(spokes: DrawOutcome[]) {
  for (let i = spokes.length - 1; i >= 0; i -= 1) {
    if (spokes[i].outerIndex !== null) return spokes[i].seq;
  }
  return -1;
}

function StatusBadge({ status }: { status: ActivityStatus }) {
  const map: Record<ActivityStatus, { text: string; cls: string }> = {
    active: { text: "进行中", cls: "bg-cyan-400/15 text-cyan-300 ring-cyan-400/40" },
    pending: { text: "未开始", cls: "bg-white/10 text-white/70 ring-white/20" },
    ended: { text: "已结束", cls: "bg-white/10 text-white/50 ring-white/15" },
    disabled: { text: "未开启", cls: "bg-white/10 text-white/50 ring-white/15" },
  };
  const it = map[status];
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-medium ring-1",
        status === "active" && "animate-pulse",
        it.cls,
      )}
    >
      {it.text}
    </span>
  );
}
