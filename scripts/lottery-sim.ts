// 只读奖池的会话模拟器；参数与收益口径见 docs/features/lottery.md。
import { readFileSync, writeFileSync } from "node:fs";
import {
  calculateLuckyChance,
  lotteryExpectation,
  rollPrize,
  round2,
  type LotteryConfig,
} from "../lib/lottery/prize-math";

/** 中奖墙口径：≥500 cr 或 ≥3 张券才算「一条能上墙的大奖」。 */
const BIG_WIN_CREDITS = 500;
const BIG_WIN_TICKETS = 3;

interface Options {
  sessions: number;
  draws: number[];
  batchSize: 1 | 10;
  target: number | null;
  soften: number | null;
  keepBreakEven: boolean;
  file: string | null;
  out: string | null;
  seed: number;
}

export function parseArgs(argv: string[]): Options {
  const opts: Options = {
    sessions: 8_000,
    draws: [1, 10, 30, 100],
    batchSize: 1,
    target: null,
    soften: null,
    keepBreakEven: true,
    file: null,
    out: null,
    seed: 20261010,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value?.trim() || value.startsWith("--")) throw new Error(`${key} 需要参数值`);
      return value;
    };
    if (key === "--sessions") opts.sessions = Number(next());
    else if (key === "--draws") opts.draws = next().split(",").map((n) => Number(n.trim()));
    else if (key === "--batch") opts.batchSize = Number(next()) as 1 | 10;
    else if (key === "--target") opts.target = Number(next());
    else if (key === "--soften") opts.soften = Number(next());
    else if (key === "--no-keep-be") opts.keepBreakEven = false;
    else if (key === "--file") opts.file = next();
    else if (key === "--out") opts.out = next();
    else if (key === "--seed") opts.seed = Number(next());
    else throw new Error(`未知参数：${key}`);
  }
  if (!Number.isSafeInteger(opts.sessions) || opts.sessions <= 0) {
    throw new Error("--sessions 必须是正整数");
  }
  if (opts.draws.some((n) => !Number.isSafeInteger(n) || n <= 0 || n > 100_000)) {
    throw new Error("--draws 必须是 1~100000 的整数列表");
  }
  if (opts.batchSize !== 1 && opts.batchSize !== 10) throw new Error("--batch 必须是 1 或 10");
  if (!Number.isInteger(opts.seed) || opts.seed < 0 || opts.seed > 0xffffffff) {
    throw new Error("--seed 必须是 0~4294967295 的整数");
  }
  if (opts.target !== null && (!Number.isFinite(opts.target) || opts.target < 0)) {
    throw new Error("--target 必须是非负有限数");
  }
  if (opts.soften !== null && (!Number.isFinite(opts.soften) || opts.soften < 0 || opts.soften > 1)) {
    throw new Error("--soften 必须在 0~1 之间");
  }
  return opts;
}

// Mulberry32 使用 32 位乘法，避免浮点大整数乘法丢位造成短周期；仅供模拟。
export function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    let value = (state = (state + 0x6d2b79f5) >>> 0);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

interface SessionStats {
  effective: number;
  effectiveStandardError: number | null;
  housePerTicket: number;
  clawbackRate: number;
  breakEvenRate: number;
  bigWinPer1k: number;
  worstDraw: number;
  upPct: number;
  medianNet: number;
  p10Net: number;
  ruinPct: number;
}

export function simulate(
  config: LotteryConfig,
  sessions: number,
  bought: number,
  rng: () => number,
  { batchSize = 1 }: { batchSize?: 1 | 10 } = {},
): SessionStats {
  const price = config.ticketPriceCredits;
  const spent = round2(bought * price);
  let draws = 0;
  let sumCredits = 0;
  let meanCredits = 0;
  let creditM2 = 0;
  let clawbacks = 0;
  let breakEven = 0;
  let bigWins = 0;
  let worstDraw = 0;
  let ruin = 0;
  const nets: number[] = [];

  for (let s = 0; s < sessions; s += 1) {
    let tickets = bought;
    let drawn = 0;
    let misses = 0;
    let credits = 0;

    while (tickets > 0) {
      const count = batchSize === 10 && tickets >= 10 ? 10 : 1;
      if (drawn + count > 100_000) {
        throw new Error(`会话 ${s + 1} 达到 100000 抽上限，剩余 ${tickets} 张券；停止输出收益，请检查赠券配置`);
      }
      tickets -= count;

      // 服务端批前只读取最近 30 条开奖记录，并在整批内复用同一个概率。
      const chance = calculateLuckyChance(misses, config.outerChancePercent);
      const active =
        chance > config.outerChancePercent ? { ...config, outerChancePercent: chance } : config;
      let prizeTickets = 0;
      const batchSpend = round2(count * price);
      for (let i = 0; i < count; i += 1) {
        const r = rollPrize(active, batchSpend, rng);
        credits += r.credits;
        prizeTickets += r.grantTickets;
        if (r.credits < 0) clawbacks += 1;
        if (r.credits + r.grantTickets * price >= price) breakEven += 1;
        if (r.credits >= BIG_WIN_CREDITS || r.grantTickets >= BIG_WIN_TICKETS) bigWins += 1;
        worstDraw = Math.min(worstDraw, r.credits);
        misses = r.ring === "outer" && (r.credits > 0 || r.grantTickets > 0)
          ? 0 : Math.min(30, misses + 1);
      }

      const drawsBefore = drawn;
      drawn += count;
      draws += count;
      tickets += prizeTickets;
      for (const milestone of config.milestones) {
        if (milestone.draws > drawsBefore && milestone.draws <= drawn) {
          tickets += milestone.tickets;
        }
      }
    }

    sumCredits += credits;
    const delta = credits - meanCredits;
    meanCredits += delta / (s + 1);
    creditM2 += delta * (credits - meanCredits);
    const net = credits - spent;
    nets.push(net);
    if (net <= -0.6 * spent) ruin += 1;
  }

  nets.sort((a, b) => a - b);
  const totalSpent = sessions * spent;
  return {
    effective: (sumCredits / totalSpent) * 100,
    // 赠券续抽彼此相关，抽样误差必须按独立会话而非逐注计算。
    effectiveStandardError: sessions > 1
      ? (Math.sqrt(creditM2 / (sessions - 1) / sessions) / spent) * 100 : null,
    housePerTicket: (totalSpent - sumCredits) / (sessions * bought),
    clawbackRate: (clawbacks / draws) * 100,
    breakEvenRate: (breakEven / draws) * 100,
    bigWinPer1k: (bigWins / draws) * 1000,
    worstDraw: Math.abs(worstDraw),
    upPct: (nets.filter((v) => v >= 0).length / nets.length) * 100,
    medianNet: nets[Math.floor(nets.length / 2)],
    p10Net: nets[Math.floor(nets.length * 0.1)],
    ruinPct: (ruin / sessions) * 100,
  };
}

/** 二分求系数：只缩放正档，把名义返还率压到 target。 */
function fitNominal(config: LotteryConfig, target: number): LotteryConfig {
  const build = (k: number): LotteryConfig => ({
    ...config,
    innerPrizes: config.innerPrizes.map((p) => ({
      credits: p.credits > 0 ? Math.round(p.credits * k) : p.credits,
      weight: p.weight,
    })),
    outerPrizes: config.outerPrizes.map((p) => ({
      ...p,
      multiplier: p.multiplier > 0 ? round2(p.multiplier * k) : p.multiplier,
    })),
  });
  return bisectScale(build, target);
}

/**
 * 负档乘 negFactor，再缩放正档补回目标名义。
 * keepBreakEven 为真时，「≤ 券价」的正档（含刚好等于券价那一档）原样不动，只削更高的档——
 * 那一档是用户眼里「刚好不亏」的锚点，等比缩掉它会明显恶化体感，而名义返还率看不出来。
 */
function reshape(
  config: LotteryConfig,
  negFactor: number,
  target: number,
  keepBreakEven: boolean,
): LotteryConfig {
  const price = config.ticketPriceCredits;
  const base: LotteryConfig = {
    ...config,
    innerPrizes: config.innerPrizes.map((p) => ({
      credits: p.credits < 0 ? round2(p.credits * negFactor) : p.credits,
      weight: p.weight,
    })),
    outerPrizes: config.outerPrizes.map((p) => ({
      ...p,
      multiplier: p.multiplier < 0 ? p.multiplier * negFactor : p.multiplier,
    })),
  };
  const build = (k: number): LotteryConfig => ({
    ...base,
    innerPrizes: base.innerPrizes.map((p) => ({
      credits: p.credits > 0 && (!keepBreakEven || p.credits > price) ? Math.round(p.credits * k) : p.credits,
      weight: p.weight,
    })),
    outerPrizes: base.outerPrizes.map((p) => ({
      ...p,
      multiplier:
        p.multiplier > 0 && (!keepBreakEven || p.multiplier * price > price)
          ? round2(p.multiplier * k)
          : p.multiplier,
    })),
  });
  return bisectScale(build, target);
}

function bisectScale(build: (k: number) => LotteryConfig, target: number): LotteryConfig {
  let lo = 0.1;
  let hi = 2;
  for (let i = 0; i < 50; i += 1) {
    const mid = (lo + hi) / 2;
    if (lotteryExpectation(build(mid)).returnRate > target) hi = mid;
    else lo = mid;
  }
  return build((lo + hi) / 2);
}

function formatPool(config: LotteryConfig): string {
  const inner = config.innerPrizes.map((p) => `${p.credits}w${p.weight}`).join(" ");
  const outer = config.outerPrizes
    .map((p) => {
      if (p.kind === "tickets") return `${p.tickets}券w${p.weight}`;
      const tag = p.kind === "permanentCredits" ? "永" : "";
      return `×${p.multiplier}${tag}w${p.weight}`;
    })
    .join(" ");
  return `内圈 ${inner}\n外圈 ${outer}`;
}

export function table(label: string, config: LotteryConfig, opts: Options): string[] {
  const nominal = lotteryExpectation(config).returnRate;
  const lines = [
    `${label}｜券价 ${config.ticketPriceCredits}｜外圈 ${config.outerChancePercent}%｜名义 ${nominal.toFixed(2)}%`,
    `批次 ${opts.batchSize}（不足10券时单抽）｜每组 ${opts.sessions} 会话｜seed ${opts.seed}｜倍率基数 ${config.multiplierBase}`,
    ["买券", "有效", "±95%抽样(pp)", "站点/券", "倒扣率", "单注≥券价", "大奖/千注", "最深倒扣", "会话不亏", "中位净", "最差10%", "亏超60%"].join("\t"),
  ];
  for (const bought of opts.draws) {
    // 每个规模及 what-if 重置同一种子，避免结果随表格顺序变化。
    const r = simulate(config, opts.sessions, bought, makeRng(opts.seed), { batchSize: opts.batchSize });
    lines.push(
      [
        `${bought}`,
        `${r.effective.toFixed(2)}%`,
        r.effectiveStandardError === null ? "N/A" : (1.96 * r.effectiveStandardError).toFixed(2),
        r.housePerTicket.toFixed(2),
        `${r.clawbackRate.toFixed(1)}%`,
        `${r.breakEvenRate.toFixed(1)}%`,
        r.bigWinPer1k.toFixed(1),
        r.worstDraw.toFixed(0),
        `${r.upPct.toFixed(0)}%`,
        r.medianNet.toFixed(0),
        r.p10Net.toFixed(0),
        `${r.ruinPct.toFixed(2)}%`,
      ].join("\t"),
    );
  }
  return lines;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const config = opts.file
    ? (JSON.parse(readFileSync(opts.file, "utf-8")) as LotteryConfig)
    : await (await import("../lib/lottery/config")).getLotteryConfig();
  const nominal = lotteryExpectation(config).returnRate;
  let outputConfig = config;

  console.log(`活动 ${config.startAt} ~ ${config.endAt}`);
  console.log(table(opts.file ? "本地配置" : "线上配置", config, opts).join("\n"));

  if (opts.target !== null || opts.soften !== null) {
    const target = opts.target ?? nominal;
    outputConfig = opts.soften !== null
      ? reshape(config, opts.soften, target, opts.keepBreakEven)
      : fitNominal(config, target);
    console.log("\n" + table("what-if", outputConfig, opts).join("\n"));
    console.log(`\nwhat-if 奖池（${opts.soften !== null ? `负档×${opts.soften}、` : ""}名义 ${lotteryExpectation(outputConfig).returnRate.toFixed(2)}%${opts.soften !== null && opts.keepBreakEven ? "、回本档未动" : ""}）：`);
    console.log(formatPool(outputConfig));
  }
  if (opts.out) {
    writeFileSync(opts.out, JSON.stringify(outputConfig, null, 2), "utf-8");
    console.log(`\n已写 ${opts.out}（只是本地文件，没有动线上 option.lottery_config）`);
  }

  console.log(
    "\n口径：每个会话从零累计/零保底开始，固定当前券价，赠券全部续抽；不含每日免费抽、跨会话累计、配置变更或余额过期。有效值可高于或低于名义值，站点/券是 cr 账本差额而非现金利润。",
  );
  console.log("±95% 是模拟均值的近似抽样误差，不是历史实际返还的预测区间；单注≥券价把赠券按面值计，倒扣率仅指 cr<0。");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
