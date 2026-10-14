/**
 * 抽奖奖池模拟器：读线上（或本地 JSON）配置，蒙特卡洛跑真实开奖路径，输出「站点收益」与
 * 「用户体感」两组指标，供调 `option.lottery_config` 之前先看数。
 *
 *   npx tsx --env-file=.env.local scripts/lottery-sim.ts
 *   npx tsx --env-file=.env.local scripts/lottery-sim.ts --target 93 --soften 0.5
 *   npx tsx --env-file=.env.local scripts/lottery-sim.ts --out /tmp/pool.json
 *   npx tsx --env-file=.env.local scripts/lottery-sim.ts --file /tmp/pool.json
 *
 * 参数：
 *   --sessions N   每种会话跑多少个（默认 8000）
 *   --draws a,b,c  会话规模 = 一次买几张券（默认 1,10,30,100）
 *   --target R     把名义返还率压到 R%（只等比缩放正档，负档不动）
 *   --soften F     负档乘 F（0.5 = 减半），再补回名义返还率；配 --keep-be 时只削高于券价的档
 *   --no-keep-be   补回名义时连「等于券价」那一档一起缩（默认关掉，因为体感主要靠它）
 *   --file P       从 JSON 读配置（默认读线上，只读不写）
 *   --out P        把最终（含 what-if）配置写到 JSON，可直接贴回后台
 *   --seed N       随机种子，默认固定，保证两次跑同一份池子结果一致
 *
 * 口径说明（和后台那行「返还率」不完全一样，别混）：
 *   - 名义返还率 = lotteryExpectation() 的数，含累抽送券均摊，是「每抽一次期望回多少 cr / 券价」。
 *   - 有效返还率 = 会话拿回的 cr 合计 / 实付券价合计。中来的券和档位赠券会让人多抽，
 *     多抽产生的 cr 也计进分子，所以它通常**高于**名义值——这才是用户账本上的真实感受。
 *   - 赠券不按面值重复计一次：它的价值体现在后续开奖的 cr 里。
 *   - credits 不是现金：中奖发的是 `prizeValidDays` 天临时余额，过期未用即站点纯利，
 *     所以这里的「站点/券」是保守（偏低）估计。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getLotteryConfig } from "../lib/lottery/config";
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
  target: number | null;
  soften: number | null;
  keepBreakEven: boolean;
  file: string | null;
  out: string | null;
  seed: number;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    sessions: 8_000,
    draws: [1, 10, 30, 100],
    target: null,
    soften: null,
    keepBreakEven: true,
    file: null,
    out: null,
    seed: 20261010,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = () => argv[(i += 1)];
    if (key === "--sessions") opts.sessions = Number(next());
    else if (key === "--draws") opts.draws = next().split(",").map((n) => Number(n.trim()));
    else if (key === "--target") opts.target = Number(next());
    else if (key === "--soften") opts.soften = Number(next());
    else if (key === "--no-keep-be") opts.keepBreakEven = false;
    else if (key === "--file") opts.file = next();
    else if (key === "--out") opts.out = next();
    else if (key === "--seed") opts.seed = Number(next());
    else {
      console.error(`未知参数：${key}`);
      process.exit(1);
    }
  }
  return opts;
}

function makeRng(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

interface SessionStats {
  effective: number;
  housePerTicket: number;
  lossRate: number;
  breakEvenRate: number;
  bigWinPer1k: number;
  worstDraw: number;
  upPct: number;
  medianNet: number;
  p10Net: number;
  ruinPct: number;
}

/**
 * 一个会话 = 买 bought 张券，一直抽到券包空（中来的券与档位赠券都能续命）。
 * 保底按「每注重算」模拟，和线上按整批取一次快照略有差别，对 10 连抽会略微高估保底触发率。
 */
function simulate(
  config: LotteryConfig,
  sessions: number,
  bought: number,
  rng: () => number,
): SessionStats {
  const price = config.ticketPriceCredits;
  let draws = 0;
  let sumCredits = 0;
  let loss = 0;
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
    let nextMilestone = 0;

    // 上限防住「一直中赠券停不下来」的极端会话；正常配置下远达不到。
    while (tickets > 0 && drawn < bought * 4 + 20) {
      tickets -= 1;
      drawn += 1;
      draws += 1;

      const chance = calculateLuckyChance(misses, config.outerChancePercent);
      const active =
        chance > config.outerChancePercent ? { ...config, outerChancePercent: chance } : config;
      const r = rollPrize(active, bought * price, rng);

      credits += r.credits;
      sumCredits += r.credits;
      tickets += r.grantTickets;
      if (r.credits < 0) loss += 1;
      if (r.credits + r.grantTickets * price >= price) breakEven += 1;
      if (r.credits >= BIG_WIN_CREDITS || r.grantTickets >= BIG_WIN_TICKETS) bigWins += 1;
      worstDraw = Math.min(worstDraw, r.credits);
      misses = r.ring === "outer" && (r.credits > 0 || r.grantTickets > 0) ? 0 : misses + 1;

      while (
        nextMilestone < config.milestones.length &&
        drawn >= config.milestones[nextMilestone].draws
      ) {
        tickets += config.milestones[nextMilestone].tickets;
        nextMilestone += 1;
      }
    }

    const spent = bought * price;
    const net = credits - spent;
    nets.push(net);
    if (net <= -0.6 * spent) ruin += 1;
  }

  nets.sort((a, b) => a - b);
  const totalSpent = sessions * bought * price;
  return {
    effective: (sumCredits / totalSpent) * 100,
    housePerTicket: (totalSpent - sumCredits) / (sessions * bought),
    lossRate: (loss / draws) * 100,
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

function table(
  label: string,
  config: LotteryConfig,
  opts: Options,
  rng: () => number,
): string[] {
  const nominal = lotteryExpectation(config).returnRate;
  const lines = [
    `${label}｜券价 ${config.ticketPriceCredits}｜外圈 ${config.outerChancePercent}%｜名义 ${nominal.toFixed(2)}%`,
    ["买券", "有效", "站点/券", "单注亏损", "单注≥券价", "大奖/千注", "最深单注", "会话不亏", "中位净", "最差10%", "亏超60%"].join("\t"),
  ];
  for (const bought of opts.draws) {
    const r = simulate(config, opts.sessions, bought, rng);
    lines.push(
      [
        `${bought}`,
        `${r.effective.toFixed(1)}%`,
        r.housePerTicket.toFixed(1),
        `${r.lossRate.toFixed(1)}%`,
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
    : await getLotteryConfig();
  const nominal = lotteryExpectation(config).returnRate;
  const rng = makeRng(opts.seed);

  console.log(table(opts.file ? "本地配置" : "线上配置", config, opts, rng).join("\n"));

  if (opts.target !== null || opts.soften !== null) {
    const target = opts.target ?? nominal;
    const next =
      opts.soften !== null
        ? reshape(config, opts.soften, target, opts.keepBreakEven)
        : fitNominal(config, target);
    console.log("\n" + table("what-if", next, opts, rng).join("\n"));
    console.log(`\nwhat-if 奖池（${opts.soften !== null ? `负档×${opts.soften}、` : ""}名义 ${lotteryExpectation(next).returnRate.toFixed(2)}%${opts.keepBreakEven ? "、回本档未动" : ""}）：`);
    console.log(formatPool(next));
    if (opts.out) {
      writeFileSync(opts.out, JSON.stringify(next, null, 2), "utf-8");
      console.log(`\n已写 ${opts.out}（只是本地文件，没有动线上 option.lottery_config）`);
    }
  }

  console.log(
    "\n口径：有效返还率含赠券续命产生的额外开奖，通常高于名义值；「站点/券」未计临时余额过期与免费抽。",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
