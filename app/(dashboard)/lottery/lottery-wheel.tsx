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
import { calculateLuckyChance, LUCKY_CHANCE_CAP_PERCENT, LUCKY_CHANCE_STEP_PERCENT } from "@/lib/lottery/prize-math";
import type { BigWinRecord } from "@/lib/lottery/records";

/** 外沿还有两道发光环，viewBox 要比最大半径留出这点余量，否则环带会被裁掉。 */
const SIZE = 400;
const C = SIZE / 2;
/** 外圈环形带、内圈盘面、中心轴三层的半径。 */
const OUTER_R = 182;
const OUTER_IN = 144;
const INNER_R = 136;
const HUB_R = 34;
const SPOKE_BASE = 20;
/**
 * 外圈读数针的两端。2026-10-23 改：起点从中心（r=0）开始，消除与中心轴的间隙。
 * 终点仍贴近外沿（OUTER_POINTER_OUT = 180）。
 */
const OUTER_POINTER_IN = 0;
const OUTER_POINTER_OUT = OUTER_R - 2;
/** 内圈标签的落点半径：贴外沿一点，同样的扇区角能多分到的弧长，标签就不容易被判「放不下」。 */
const INNER_LABEL_R = INNER_R * 0.76;

/**
 * 内圈拆成两段（2026-10-19 提速）：预转在服务端请求发出的瞬间就开始，用来盖住那段网络等待
 * （原先请求回来前盘面是静止的，白等 1 秒左右）；响应回来后再接管转到真正的停点。
 * CSS transition 中途改目标值会从当前插值位置继续过渡，所以接管不会跳。
 */
const PRE_SPIN_MS = 1200;
const PRE_SPIN_DEG = 540;
const SPIN_SETTLE_MS = 1500;
const SETTLE_EASING = "cubic-bezier(0.16, 0.9, 0.2, 1)";
const SPIN_OUTER_MS = 1500;
/** 读数针从上一格滑到下一格：环带只在第一发进外圈时摇一次，后面不再重摇（结果已定，摇圈没有信息量）。 */
const OUTER_SWEEP_MS = 700;
/** 一次外圈转停后停留多久再读下一发（10 连抽可能进入好几次）。 */
const OUTER_HOLD_MS = 800;
const SPOKE_STEP_MS = 130;

type Tone = "positive" | "negative" | "zero" | "entry" | "ticket" | "permanent";

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
  /** 今日是否还有免费抽 1 次的额度（服务端查 ticketId IS NULL 的今日记录）。 */
  freeDrawAvailable: boolean;
  /** 当前连续未中大奖次数，用于保底进度条展示。 */
  consecutiveMisses: number;
  /** 保底触发阈值（连续未中达此次数后外圈概率开始线性提升）。 */
  luckyThreshold: number;
  /** 最近 24 小时大奖记录，用于中奖墙展示。 */
  bigWins: BigWinRecord[];
  /** 用户当前可用总余额（永久+未过期临时），用于买券按钮余额不足时禁用。 */
  balanceCredits: number;
}

/** 霓虹配色：每个音调给深浅两档交替，相邻扇区才分得开。赠券档用金色与 cr 档区分。 */
const NEON: Record<Tone, [string, string]> = {
  positive: ["#22d3ee", "#0b7285"],
  negative: ["#fb7185", "#8f1d3f"],
  zero: ["#64748b", "#3b4757"],
  entry: ["#c084fc", "#6b21a8"],
  ticket: ["#fbbf24", "#7c4a03"],
  permanent: ["#4ade80", "#166534"],
};

const PANEL = "radial-gradient(circle at 50% 38%, #1a2445 0%, #0a0f22 55%, #05070f 100%)";

function polar(r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) };
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前。 */
function relativeTime(date: Date | null): string {
  if (!date) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
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

/** `spans()` 的一个扇区角度区间，单位为「12 点方向为 0、顺时针」的度。 */
type Span = { start: number; end: number; center: number };

/** 标签切向排布，落点半径处的弧长就是它能占到的宽度。 */
function arcAt(r: number, span: Span) {
  return ((span.end - span.start) * Math.PI * r) / 180;
}

/**
 * 字号按「可用弧长 ÷ 标签宽度」收缩，缩到 7.5 以下就整段不画：外圈 1% 上下的格子只有
 * 两三度，"+1250 cr" 硬画会压到邻居格子的标签上。这类档位的文案与概率在下方「奖池与规则」全量公示。
 */
function labelSize(r: number, span: Span, label: string, base: number) {
  const size = Math.min(base, arcAt(r, span) / (Math.max(1, label.length) * 0.55));
  return size >= 7.5 ? size : null;
}

/**
 * 连一个标签都放不下的格子退化成单个记号（★=cr 档，券=赠券档），至少看得出这一格有东西；
 * 记号也塞不下的（<2°）再由调用方退化成亮点，见 `Glyph`。
 */
function markerSize(r: number, span: Span) {
  const size = Math.min(10, arcAt(r, span) - 1);
  return size >= 6 ? size : null;
}

/**
 * 一格在盘面上的文字表达，三级退化：标签 → 记号（★/券）→ 亮点。
 * 走到亮点这一档的都是概率不到 0.2% 的极窄扇区，不画点什么看起来就是「这一格里没有奖品」，
 * 而头奖恰恰在这些格子里；具体文案与概率由扇区上的 `<title>` 与下方「奖池与规则」给出。
 */
function Glyph(props: {
  span: Span;
  anchor: { x: number; y: number };
  label: string;
  marker: string;
  tone: Tone;
  labelR: number;
  labelBase: number;
  bold?: boolean;
}) {
  const { span, anchor, label, marker, tone, labelR, labelBase, bold } = props;
  const size = labelSize(labelR, span, label, labelBase);
  if (size !== null) {
    return (
      <text
        x={anchor.x}
        y={anchor.y}
        transform={`rotate(${span.center} ${anchor.x} ${anchor.y})`}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#f8fafc"
        fontSize={size}
        fontWeight={bold ? 700 : 600}
      >
        {label}
      </text>
    );
  }
  const mSize = markerSize(labelR, span);
  if (mSize !== null) {
    return (
      <text
        x={anchor.x}
        y={anchor.y}
        transform={`rotate(${span.center} ${anchor.x} ${anchor.y})`}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#f8fafc"
        fontSize={mSize}
        fontWeight={700}
      >
        {marker}
      </text>
    );
  }
  return (
    <circle
      cx={anchor.x}
      cy={anchor.y}
      r={2.4}
      fill={NEON[tone][0]}
      stroke="#05070f"
      strokeWidth={0.6}
      filter="url(#neon-glow)"
    />
  );
}

/**
 * 概率文案：稀有档真实概率不到 0.1%，按一位小数显示会变成「0.0%」，看着像根本抽不中。
 * `chance` 在视图层按两位小数取整过，所以低于 0.01% 的档只剩「<0.01%」这种诚实写法。
 */
function formatChance(percent: number) {
  if (percent >= 1) return `${percent.toFixed(1)}%`;
  if (percent >= 0.01) return `${percent.toFixed(2)}%`;
  return percent > 0 ? "<0.01%" : "0%";
}

/** 悬停（触摸为长按）时浏览器原样显示的说明，把盘面上被缩成记号/亮点的完整信息补回来。 */
function sectorTitle(label: string, batchLabel: string | undefined, chance: number) {
  return `${label}${batchLabel ? `（10 连 ${batchLabel}）` : ""} · 概率 ${formatChance(chance)}`;
}

/** 让目标扇区中心转到某个角度处，且始终往前转（不倒着回去）。 */
function rotationTo(current: number, sectorCenter: number, targetAngle: number, turns: number) {
  const desired = ((targetAngle - sectorCenter) % 360 + 360) % 360;
  const floor = current - (((current % 360) + 360) % 360);
  let next = floor + turns * 360 + desired;
  if (next <= current) next += 360;
  return next;
}

/**
 * 每根结果指针在盘面局部坐标下的角度（与内圈一起旋转）。
 *
 * 同一扇区被多次命中时，指针按扇区宽度的 70% 并排散开，免得叠成一根。**外圈对位必须用这张表里的角**：
 * 2026-10-19 修——原先外圈是按入口扇区的正中（`span.center`）对位，而入口那根长指针常常因为并排
 * 被推开十几度（10 连抽里入口扇区命中 3 根时偏移 ±22.7°），转停后奖品停在指针旁边，看起来就是
 * 「指针没停到实际区域」。渲染和动画目标改成同一个来源，两边就不可能再对不上。
 */
function spokeAngles(results: DrawOutcome[], sectorSpans: Span[]) {
  const countByIndex = new Map<number, number>();
  for (const spoke of results) {
    countByIndex.set(spoke.innerIndex, (countByIndex.get(spoke.innerIndex) ?? 0) + 1);
  }
  const seqByIndex = new Map<number, number>();
  const angles = new Map<number, number>();
  for (const spoke of results) {
    const span = sectorSpans[spoke.innerIndex] ?? sectorSpans[0];
    if (!span) continue;
    const count = countByIndex.get(spoke.innerIndex) ?? 1;
    const idx = seqByIndex.get(spoke.innerIndex) ?? 0;
    seqByIndex.set(spoke.innerIndex, idx + 1);
    const step = count > 1 ? ((span.end - span.start) * 0.7) / (count - 1) : 0;
    const angleOffset = count > 1 ? (idx - (count - 1) / 2) * step : 0;
    angles.set(spoke.seq, span.center + angleOffset);
  }
  return angles;
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
  /**
   * 内圈当前这一段的过渡参数（2026-10-19 提速）：预转用匀速、接管定停用减速曲线，
   * 两段时长不同，所以不能像原先那样把 transition 写死在渲染里。
   */
  const [innerSpin, setInnerSpin] = useState<{ ms: number; easing: string }>({
    ms: SPIN_SETTLE_MS,
    easing: SETTLE_EASING,
  });
  /**
   * 外圈读数针数组：每次进入外圈就加一根，停在该发奖品的格子上。
   * 2026-10-23 改：多根长针同时显示（不再只有一根依次移动），每根对应一次外圈入口。
   */
  const [outerNeedles, setOuterNeedles] = useState<{ deg: number; colorIndex: number }[]>([]);
  /** 第一根针的动画控制：先瞬移到入口落点，再扫到奖励格。 */
  const [firstNeedleAnimated, setFirstNeedleAnimated] = useState(true);
  const [firstNeedleMs, setFirstNeedleMs] = useState(SPIN_OUTER_MS);
  const [phase, setPhase] = useState<"idle" | "inner" | "outer" | "done">("idle");
  const [tickets, setTickets] = useState(props.tickets);
  const [spokes, setSpokes] = useState<DrawOutcome[]>([]);
  const [results, setResults] = useState<DrawOutcome[] | null>(null);
  const [buyCount, setBuyCount] = useState(10);
  const [buying, setBuying] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  /** 本次会话内免费抽是否已用掉；服务端 revalidate 后 props 会更新，但动画期间靠本地状态挡重复点击。 */
  const [freeDrawUsed, setFreeDrawUsed] = useState(false);
  /** 动画期间显示的本次外圈概率（含保底提升）；抽奖请求返回后立即设置，动画结束后清空。 */
  const [drawingLuckyChance, setDrawingLuckyChance] = useState<number | null>(null);
  const timers = useRef<number[]>([]);

  const active = props.status === "active";
  const busy = phase === "inner" || phase === "outer";
  /** 免费抽可用：服务端说有额度 + 本次会话还没用。 */
  const canFreeDraw = props.freeDrawAvailable && !freeDrawUsed;
  const consecutiveMisses = props.consecutiveMisses;
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
    // 免费抽只对单抽生效；10 连抽和免费抽之后的单抽都需要券。
    const useFree = count === 1 && canFreeDraw;
    if (!useFree && tickets < count) {
      toast.error(`抽奖券不足，本次需要 ${count} 张`);
      return;
    }
    timers.current.forEach((id) => clearTimeout(id));
    timers.current = [];
    setPhase("inner");
    setResults(null);
    setSpokes([]);
    setOuterNeedles([]);
    // 2026-10-19 提速：请求一发出就先匀速空转，把服务端那段等待盖掉（这一段与结果无关）。
    const preSpinDeg = innerRotation + PRE_SPIN_DEG;
    setInnerRotation(preSpinDeg);
    setInnerSpin({ ms: PRE_SPIN_MS, easing: "linear" });

    const response = await drawLottery(count, useFree);
    if (!response.success) {
      setPhase("idle");
      // 开奖失败时预转已经转出去了，用一段短减速把它停住（目标角不变，只改时长，所以不会跳）。
      setInnerSpin({ ms: 400, easing: SETTLE_EASING });
      toast.error(response.error);
      router.refresh();
      return;
    }

    // 免费抽成功后标记本地已用，按钮立刻变回收费状态（不需要等 revalidate）。
    if (response.data.freeDrawUsed) {
      setFreeDrawUsed(true);
    }

    const drawn = response.data.results;
    setResults(drawn);
    setTickets(response.data.ticketsLeft);
    // 动画期间实时显示本次外圈概率（含保底提升）
    setDrawingLuckyChance(response.data.luckyChancePercent ?? props.outerChancePercent);

    // 内圈：从预转的位置接管，把最后一次的落点转到顶部指针处。
    const last = drawn[drawn.length - 1];
    const lastSpan = innerSectorSpans[last.innerIndex] ?? innerSectorSpans[0];
    // 先算出内圈最终角度并留住：外圈读数针的位置要用同一个基准，否则两边会错开。
    // 圈数从 5 降到 2：预转已经转掉一圈半，接管段只需再转两圈就够看。
    const innerFinal = rotationTo(preSpinDeg, lastSpan.center, 0, 2);
    setInnerRotation(innerFinal);
    setInnerSpin({ ms: SPIN_SETTLE_MS, easing: SETTLE_EASING });

    // 计时器的零点是「响应回来、接管开始」那一刻，所以起点只剩接管这一段。
    const revealStart = SPIN_SETTLE_MS;
    drawn.forEach((result, index) => {
      later(() => {
        setSpokes((prev) => [...prev, result]);
      }, revealStart + index * SPOKE_STEP_MS);
    });

    // 外圈：每一次进入外圈都加一根读数针，停在该发奖品的格子上。
    // 2026-10-23 改：多根长针同时显示（不再只有一根依次移动）。
    // 环带只在第一发摇一次，后面几发的针直接出现在各自格子上。
    const entries = drawn.filter((r) => r.outerIndex !== null);
    const entryAngles = spokeAngles(drawn, innerSectorSpans);
    const spokesDone = revealStart + drawn.length * SPOKE_STEP_MS;
    if (entries.length > 0) {
      let at = spokesDone + 120;
      entries.forEach((entry, index) => {
        const outerSpan = outerSpans[entry.outerIndex ?? 0] ?? outerSpans[0];
        // 外圈只整圈转（3 圈），所以这一格转停后的朝向 = 它此刻的自然朝向，与转几圈无关。
        const restDeg = (((outerSpan.center + innerFinal + outerRotation) % 360) + 360) % 360;
        const jumpAt = at;
        if (index === 0) {
          later(() => {
            setPhase("outer");
            // 第一根针：先瞬移到入口落点（不动画），下一步再扫到奖励格。
            setFirstNeedleAnimated(false);
            setOuterNeedles([{ deg: entryAngles.get(entry.seq) ?? 0, colorIndex: 0 }]);
          }, jumpAt);
          later(() => {
            setFirstNeedleAnimated(true);
            setFirstNeedleMs(SPIN_OUTER_MS);
            setOuterNeedles([{ deg: restDeg, colorIndex: 0 }]);
            setOuterRotation((current) => current + 3 * 360);
          }, jumpAt + 60);
          at = jumpAt + SPIN_OUTER_MS + OUTER_HOLD_MS;
        } else {
          later(() => {
            // 后续针：直接出现在各自格子上（环带已停，位置固定）。
            setOuterNeedles((prev) => [...prev, { deg: restDeg, colorIndex: index }]);
          }, jumpAt);
          at = jumpAt + OUTER_SWEEP_MS + OUTER_HOLD_MS;
        }
      });
      later(() => setPhase("done"), at);
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
    if (response.data.freeDrawUsed) {
      later(() => toast.info("今日免费抽已使用，明天再来"), spokesDone + 480);
    }
    if (response.data.luckyBoosted) {
      later(
        () => toast.info(`保底已触发：本次外圈概率 ${response.data.luckyChancePercent}%`),
        spokesDone + 600,
      );
    }
    later(() => {
      setDrawingLuckyChance(null);
      router.refresh();
    }, spokesDone);
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
        <div style={{ background: PANEL }} className="px-5 pb-4 pt-4">
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

          <div className="relative mx-auto mt-2 w-full max-w-[520px]">
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
                  const batchSize = prize.batchLabel
                    ? labelSize(midR - 9, span, `10连 ${prize.batchLabel}`, 9)
                    : null;
                  return (
                    <g key={`outer-${index}`}>
                      <title>{sectorTitle(prize.label, prize.batchLabel, prize.chance)}</title>
                      <path
                        d={annulusSector(OUTER_R, OUTER_IN, span.start, span.end)}
                        {...sectorPaint(prize.tone, index)}
                        stroke="#05070f"
                        strokeWidth={2}
                      />
                      <Glyph
                        span={span}
                        anchor={anchor}
                        label={prize.label}
                        marker={prize.tone === "ticket" ? "券" : "★"}
                        tone={prize.tone}
                        labelR={midR}
                        labelBase={11}
                      />
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
                  transition: `transform ${innerSpin.ms}ms ${innerSpin.easing}`,
                }}
              >
                {props.innerSectors.map((sector, index) => {
                  const span = innerSectorSpans[index];
                  const anchor = polar(INNER_LABEL_R, span.center);
                  const near = polar(INNER_R * 0.32, span.center);
                  const tone: Tone = sector.tone;
                  const hintSize = labelSize(INNER_R * 0.32, span, "↓ 外圈", 10);
                  return (
                    <g key={`inner-${index}`}>
                      <title>{sectorTitle(sector.label, undefined, sector.chance)}</title>
                      <path
                        d={discSector(INNER_R, span.start, span.end)}
                        {...sectorPaint(tone, index)}
                        stroke="#05070f"
                        strokeWidth={2}
                      />
                      <Glyph
                        span={span}
                        anchor={anchor}
                        label={sector.label}
                        marker="★"
                        tone={tone}
                        labelR={INNER_LABEL_R}
                        labelBase={sector.kind === "entry" ? 12 : 11}
                        bold
                      />
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

                {/* 结果指针：内圈落点画短线，只画不进入外圈的指针。
                    2026-10-23 改：进入外圈的指针不再画（由静态层的多根读数针代替），避免指针总数混乱。
                    角度一律取 spokeAngles()，与外圈对位同源。 */}
                {(() => {
                  const angles = spokeAngles(spokes, innerSectorSpans);
                  return spokes
                    .filter((spoke) => spoke.outerIndex === null)
                    .map((spoke) => {
                      const angle = angles.get(spoke.seq) ?? 0;
                      const tip = polar(INNER_R - 6, angle);
                      const base = polar(SPOKE_BASE, angle);
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
                            stroke="#f0f9ff"
                            strokeWidth={3}
                            strokeLinecap="round"
                            filter="url(#neon-glow)"
                          />
                          <circle cx={tip.x} cy={tip.y} r={4} fill="#22d3ee" />
                        </g>
                      );
                    });
                })()}
              </g>

              {/* 外圈读数针（多根）：静态层（不随内圈转），每根停在该发奖品的格子上。
                  2026-10-23 改：多根长针同时显示，每根对应一次外圈入口。第一根有动画，后续直接出现。 */}
              {outerNeedles.map((needle, idx) => {
                const from = polar(OUTER_POINTER_IN, 0);
                const to = polar(OUTER_POINTER_OUT, 0);
                const isFirst = idx === 0;
                const colors = ["#f0abfc", "#22d3ee", "#fbbf24", "#a78bfa", "#fb7185"];
                const color = colors[needle.colorIndex % colors.length];
                return (
                  <g
                    key={idx}
                    style={{
                      transform: `rotate(${needle.deg}deg)`,
                      transformOrigin: "50% 50%",
                      transition: isFirst
                        ? firstNeedleAnimated
                          ? `transform ${firstNeedleMs}ms ${SETTLE_EASING}`
                          : "none"
                        : "none",
                    }}
                  >
                    <line
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={color}
                      strokeWidth={5}
                      strokeLinecap="round"
                      filter="url(#neon-glow)"
                    />
                    <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#fdf4ff" strokeWidth={2} strokeLinecap="round" />
                    <circle cx={to.x} cy={to.y} r={5} fill={color} filter="url(#neon-glow)" />
                  </g>
                );
              })}

              <circle cx={C} cy={C} r={HUB_R} fill="url(#hub-gradient)" stroke="#22d3ee" strokeOpacity={0.6} strokeWidth={1.5} />
              <text x={C} y={C - 3} textAnchor="middle" fill="#f8fafc" fontSize={16} fontWeight={700}>
                {tickets}
              </text>
              <text x={C} y={C + 14} textAnchor="middle" fill="#94a3b8" fontSize={9}>
                张券
              </text>
            </svg>
          </div>

          <p className="mt-1.5 text-center text-[11px] leading-relaxed text-white/40">
            格子太窄时文案会先缩成 <span className="text-white/75">★</span>（cr 档）或{" "}
            <span className="text-white/75">券</span>（赠券档），窄到连记号都放不下的只留一个亮点——
            那正是概率最低的几档。鼠标悬停在格子上可看完整奖品与概率，全部档位也在下方「奖池与规则」公示。
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              onClick={() => handleDraw(1)}
              disabled={!active || busy || (!canFreeDraw && tickets < 1)}
              className="h-11 rounded-lg bg-cyan-400 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "开奖中…" : canFreeDraw ? "免费抽 1 次" : `抽 1 次（${tickets} 券）`}
            </button>
            <button
              onClick={() => handleDraw(10)}
              disabled={!active || busy || tickets < 10}
              className="h-11 rounded-lg border border-fuchsia-400/70 text-sm font-semibold text-fuchsia-200 transition hover:bg-fuchsia-400/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "开奖中…" : "抽 10 次"}
            </button>
          </div>

          {/* 保底进度条：连续未中达阈值后外圈概率线性提升（每多1次+0.5%，上限35%） */}
          <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-white/50">保底进度（连续未中大奖）</span>
              <span
                className={
                  (drawingLuckyChance !== null || consecutiveMisses >= props.luckyThreshold)
                    ? "text-amber-300 font-medium"
                    : "text-white/60"
                }
              >
                {drawingLuckyChance !== null
                  ? `本次外圈概率 ${drawingLuckyChance}%${drawingLuckyChance > props.outerChancePercent ? "（保底已触发）" : ""}`
                  : consecutiveMisses >= props.luckyThreshold
                    ? `外圈概率 ${calculateLuckyChance(consecutiveMisses, props.outerChancePercent)}%（上限 ${LUCKY_CHANCE_CAP_PERCENT}%）`
                    : `${consecutiveMisses} / ${props.luckyThreshold}`}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  (drawingLuckyChance !== null || consecutiveMisses >= props.luckyThreshold)
                    ? "bg-gradient-to-r from-amber-400 to-orange-400"
                    : "bg-gradient-to-r from-cyan-400 to-fuchsia-400",
                )}
                style={{
                  width: `${
                    drawingLuckyChance !== null
                      ? Math.min(
                          100,
                          ((drawingLuckyChance - props.outerChancePercent) /
                            (LUCKY_CHANCE_CAP_PERCENT - props.outerChancePercent)) *
                            100,
                        )
                      : consecutiveMisses >= props.luckyThreshold
                        ? Math.min(
                            100,
                            ((calculateLuckyChance(consecutiveMisses, props.outerChancePercent) -
                              props.outerChancePercent) /
                              (LUCKY_CHANCE_CAP_PERCENT - props.outerChancePercent)) *
                              100,
                          )
                        : Math.min(100, (consecutiveMisses / props.luckyThreshold) * 100)
                  }%`,
                }}
              />
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-white/35">
              连续 {props.luckyThreshold} 次未中外圈正档（正数 cr 或赠券）后，每多 1 次未中外圈概率 +{LUCKY_CHANCE_STEP_PERCENT}%，
              上限 {LUCKY_CHANCE_CAP_PERCENT}%；中一次大奖后计数清零重新累积。
            </p>
          </div>

          <div className="mt-2 flex items-end gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex-1">
              <label className="text-[11px] text-white/50" htmlFor="lottery-buy-count">
                购买抽奖券（{props.ticketPriceCredits} cr / 张）
                <span className="ml-2 text-white/40">
                  需 {(buyCount * props.ticketPriceCredits).toFixed(2)} cr / 余额 {props.balanceCredits.toFixed(2)} cr
                </span>
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
              disabled={!active || buying || props.balanceCredits < buyCount * props.ticketPriceCredits}
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
        {/* 我的战绩：顶部展示，用户最关心 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">我的战绩</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-border bg-muted/40 py-2">
              <p className="text-xl font-bold">{props.totalDraws}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">累计抽奖</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 py-2">
              <p className="text-xl font-bold">{tickets}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">可用券</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 py-2">
              <p className="text-xl font-bold">{formatCredits(props.totalCredits)}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">总余额 cr</p>
            </div>
          </CardContent>
        </Card>

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

        {/* 中奖墙：最近 24 小时大奖播报，纵向无缝滚动，社会化证明「真的能中」 */}
        <Card className="overflow-hidden">
          <style>{bigWinMarqueeKeyframes}</style>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <span>🏆</span>
              最近大奖
              <span className="text-xs font-normal text-muted-foreground">（24 小时 · 悬停暂停）</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {props.bigWins.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">暂无大奖记录，来做第一个幸运儿！</p>
            ) : (
              <div className="relative h-56 overflow-hidden">
                <div className="lottery-bigwin-track space-y-2 px-3 py-2">
                  {/* 复制一份实现无缝滚动 */}
                  {[...props.bigWins, ...props.bigWins].map((win, idx) => (
                    <div
                      key={`${win.id}-${idx}`}
                      className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5"
                    >
                      <span className="shrink-0 text-base leading-none">
                        {win.grantTickets > 0 ? "🎟️" : "💰"}
                      </span>
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">{win.userLabel}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {relativeTime(win.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm font-semibold">
                          {win.credits > 0 && `+${formatCredits(win.credits)} cr`}
                          {win.grantTickets > 0 && `+${win.grantTickets} 张券`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
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
                    <span className="block text-[10px]">{formatChance(s.chance)}</span>
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
                    <span className="block text-[10px]">{formatChance(p.chance)}</span>
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
              <li>内圈指针停在「外圈入口」时指针变长顶到环带内侧，随后一根贯穿盘面的外圈读数针从落点扫到转停后的那一格奖励上，并停在那一格。</li>
              <li>10 连抽一次转停后依次落 10 根指针；外圈只摇一次，读数针按开奖顺序逐发滑到各自的中奖格。</li>
              <li>中奖 cr 作为临时余额发放，有效期 {props.prizeValidDays} 天，过期未用自动消失。</li>
              <li>转到倒扣时先扣未过期的临时余额（越早到期越先扣），不够再扣永久余额，本金可能因此扣成负数。</li>
              <li>活动结束后未使用的券作废，不折算回 cr。</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
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

/** 中奖墙纵向无缝滚动动画 */
const bigWinMarqueeKeyframes = `
@keyframes lottery-bigwin-scroll {
  0% { transform: translateY(0); }
  100% { transform: translateY(-50%); }
}
.lottery-bigwin-track {
  animation: lottery-bigwin-scroll 60s linear infinite;
}
.lottery-bigwin-track:hover {
  animation-play-state: paused;
}
`;
