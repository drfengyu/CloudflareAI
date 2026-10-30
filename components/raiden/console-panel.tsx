"use client";

import { useState } from "react";
import {
  Activity,
  Bomb,
  Coins,
  Crosshair,
  Gamepad2,
  Heart,
  LifeBuoy,
  ListOrdered,
  ScrollText,
  ShieldCheck,
  Swords,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCredits } from "@/lib/billing/credits";
import { formatCnDateTime } from "@/lib/date";
import {
  loadoutCost,
  RAIDEN_STAGES,
  stageMeta,
  stageRewardFor,
  type RaidenActivityStatus,
  type RaidenConfig,
  type RaidenLoadout,
} from "@/lib/raiden/config";
import type {
  BigWinRow,
  LeaderboardRow,
  MyRaidenSummary,
} from "@/lib/raiden/records";
import { HP_HEAL_KILLS, type HudSnapshot } from "./engine";
import { BULLET_TYPES, describeWeapon, MAX_WEAPON_LEVEL, WEAPONS } from "./weapons";
import { formatStageTime, scoreText } from "@/lib/raiden/format";
import { LoadoutShop } from "./loadout-shop";

type TabKey = "loadout" | "records" | "rank" | "rules" | "live";

const STATUS_LABEL: Record<RaidenActivityStatus, string> = {
  active: "进行中",
  pending: "未开始",
  disabled: "未开启",
  ended: "已结束",
};

const STATUS_TONE: Record<RaidenActivityStatus, "success" | "muted" | "warning" | "danger"> = {
  active: "success",
  pending: "warning",
  disabled: "muted",
  ended: "danger",
};

const IDLE_TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "loadout", label: "装备", icon: Gamepad2 },
  { key: "records", label: "记录", icon: ScrollText },
  { key: "rank", label: "排行", icon: ListOrdered },
  { key: "rules", label: "规则", icon: Swords },
];

const RUN_TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "live", label: "战况", icon: Activity },
  { key: "rank", label: "排行", icon: ListOrdered },
  { key: "rules", label: "规则", icon: Swords },
];

/** 游戏画面旁的作战面板：准备期放装备/记录/排行/规则，出击后切成实时战况。 */
export function ConsolePanel({
  config,
  status,
  balance,
  runsLeft,
  summary,
  leaderboard,
  firstClears,
  loadout,
  onLoadoutChange,
  inRun,
  paused,
  hud,
  runCost,
  rewardTotal,
  revivesUsed,
}: {
  config: RaidenConfig;
  status: RaidenActivityStatus;
  balance: number;
  runsLeft: number;
  summary: MyRaidenSummary;
  leaderboard: LeaderboardRow[];
  firstClears: BigWinRow[];
  loadout: RaidenLoadout;
  onLoadoutChange: (loadout: RaidenLoadout) => void;
  inRun: boolean;
  paused: boolean;
  hud: HudSnapshot;
  runCost: number | null;
  rewardTotal: number;
  revivesUsed: number;
}) {
  const [tab, setTab] = useState<TabKey>("loadout");
  const tabs = inRun ? RUN_TABS : IDLE_TABS;
  const active = tabs.some((item) => item.key === tab) ? tab : tabs[0].key;

  return (
    <aside
      id="raiden-console"
      className="flex min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#060b13] text-white shadow-[0_24px_80px_-48px_rgba(34,211,238,0.55)] xl:h-full"
    >
      <div className="shrink-0 border-b border-white/10 bg-[linear-gradient(120deg,rgba(34,211,238,0.12),transparent_60%)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.38em] text-cyan-300/60">Tactical Console</p>
            <h2 className="mt-0.5 flex items-baseline gap-2 font-mono text-sm font-bold tracking-[0.16em] text-white">
              作战面板
              <span className="text-[9px] font-normal tracking-[0.2em] text-white/30">RAIDEN III</span>
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {inRun && paused ? <Badge tone="warning">已暂停</Badge> : null}
            <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-3 divide-x divide-white/10 rounded-lg border border-white/10 bg-black/20">
          <ConsoleStat label="可用余额" value={`${formatCredits(balance)} cr`} />
          <ConsoleStat label="今日剩余" value={`${runsLeft} / ${config.dailyRuns} 次`} />
          <ConsoleStat
            label={inRun ? "本局奖励" : "装备费用"}
            value={inRun ? `+${formatCredits(rewardTotal)} cr` : `${formatCredits(loadoutCost(config, loadout))} cr`}
            tone={inRun ? "text-amber-200" : undefined}
          />
        </div>
      </div>

      <div className="flex shrink-0 gap-1 border-b border-white/10 px-3 py-2">
        {tabs.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition",
                isActive
                  ? "border-cyan-400/45 bg-cyan-400/12 text-cyan-200"
                  : "border-transparent text-white/45 hover:bg-white/5 hover:text-white/70",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 px-3 py-3 xl:overflow-y-auto xl:[scrollbar-width:thin]">
        {active === "live" ? (
          <LivePanel
            hud={hud}
            paused={paused}
            runCost={runCost ?? 0}
            rewardTotal={rewardTotal}
            revivesUsed={revivesUsed}
            revivesLeft={Math.max(0, config.maxRevives - revivesUsed)}
            maxRevives={config.maxRevives}
            runsLeft={runsLeft}
            rewardValidDays={config.rewardValidDays}
            revivePrice={config.revivePriceCredits}
          />
        ) : active === "loadout" ? (
          <LoadoutShop config={config} loadout={loadout} onChange={onLoadoutChange} />
        ) : active === "records" ? (
          <RecordsPanel summary={summary} />
        ) : active === "rank" ? (
          <RankPanel leaderboard={leaderboard} firstClears={firstClears} />
        ) : (
          <RulesPanel config={config} />
        )}
      </div>
    </aside>
  );
}

function ConsoleStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 px-2.5 py-1.5 text-center">
      <p className="truncate text-[9px] text-white/40">{label}</p>
      <p className={cn("mt-0.5 truncate font-mono text-[11px] font-semibold text-white/90", tone)}>
        {value}
      </p>
    </div>
  );
}

function LivePanel({
  hud,
  paused,
  runCost,
  rewardTotal,
  revivesUsed,
  revivesLeft,
  maxRevives,
  runsLeft,
  rewardValidDays,
  revivePrice,
}: {
  hud: HudSnapshot;
  paused: boolean;
  runCost: number;
  rewardTotal: number;
  revivesUsed: number;
  revivesLeft: number;
  maxRevives: number;
  runsLeft: number;
  rewardValidDays: number;
  revivePrice: number;
}) {
  const meta = stageMeta(hud.stage);
  const net = Math.round((rewardTotal - runCost - revivesUsed * revivePrice) * 100) / 100;
  const hpPct = Math.max(0, Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100));
  const healPrev = Math.max(0, hud.healAt - HP_HEAL_KILLS);
  const healPct = Math.max(0, Math.min(100, ((hud.kills - healPrev) / HP_HEAL_KILLS) * 100));
  const healIn = Math.max(0, hud.healAt - hud.kills);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-white/45">
          STAGE {hud.stage} / {hud.stageCount} · {meta.name}
        </p>
        <span className={cn("text-[10px]", paused ? "text-amber-300/80" : "text-cyan-300/70")}>
          {paused ? "已暂停，计时冻结" : hud.state === "ready" ? "出击准备中" : "作战进行中"}
        </span>
      </div>

      <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(105px,1fr))]">
        <LiveStat label="本局得分" value={scoreText(hud.score)} mono highlight />
        <LiveStat label="本关用时" value={formatStageTime(hud.stageTime)} mono />
        <LiveStat
          label="机体 HP"
          value={`${hud.hp} / ${hud.maxHp}`}
          mono
          icon={Heart}
          tone={hpPct > 50 ? "text-emerald-300" : hpPct > 25 ? "text-amber-300" : "text-rose-300"}
        />
        <LiveStat
          label={`武器 · ${WEAPONS[hud.weapon].name}`}
          value={`Lv ${hud.weaponLevel} / ${hud.maxWeaponLevel}`}
          icon={Zap}
        />
        <LiveStat label="剩余生命" value={`× ${hud.lives}`} icon={Heart} />
        <LiveStat label="炸弹存量" value={`× ${hud.bombs}`} icon={Bomb} />
      </div>

      <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] px-3 py-2">
        <div className="flex items-center justify-between gap-2 text-[10px]">
          <span className="text-emerald-200/80">击破回满进度</span>
          <span className="font-mono text-white/55">
            {hud.kills} / {hud.healAt} · 再 {healIn} 架回满
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300 transition-[width] duration-150"
            style={{ width: `${healPct}%` }}
          />
        </div>
        <p className="mt-1 text-[9px] text-white/30">
          每击破 {HP_HEAL_KILLS} 架敌机，机体 HP 立刻回满；被击落或进入新关卡也会满血。
        </p>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        <div className="flex items-center justify-between gap-2 text-[10px]">
          <span className="flex min-w-0 items-center gap-1 text-rose-300/90">
            <Crosshair className="h-3 w-3 shrink-0" />
            <span className="truncate">{hud.bossHp !== null ? (hud.bossName ?? "BOSS") : "Boss 尚未出现"}</span>
          </span>
          <span className="shrink-0 font-mono text-white/50">
            {hud.bossHp !== null ? `${Math.ceil(hud.bossHp * 100)}%` : "CLEARING"}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400 transition-[width] duration-150"
            style={{ width: `${Math.max(0, Math.min(100, (hud.bossHp ?? 0) * 100))}%` }}
          />
        </div>
        <p className="mt-1 text-[9px] text-white/30">
          {hud.bossHp !== null ? "击破 Boss 即可推进关卡" : "清剿当前空域，Boss 即将入场"}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[10px]">
        <Chip
          icon={Crosshair}
          text={`${WEAPONS[hud.weapon].name} ${hud.weapon} Lv${hud.weaponLevel}`}
        />
        <Chip
          icon={Coins}
          text={`战利品 ${formatCredits(hud.loot)} cr`}
          muted={hud.loot === 0}
        />
        <Chip
          icon={ShieldCheck}
          text={hud.shield ? `护盾 ${Math.max(0, hud.shieldTime).toFixed(1)}s` : "护盾待命"}
          muted={!hud.shield}
        />
        {maxRevives > 0 ? (
          <Chip icon={LifeBuoy} text={`复活剩 ${revivesLeft} 次`} muted={revivesLeft === 0} />
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <LiveStat label="本局已获奖励" value={`+${formatCredits(rewardTotal)} cr`} tone="text-amber-200" />
        <LiveStat label="装备花费" value={`${formatCredits(runCost)} cr`} />
        <LiveStat
          label="复活花费"
          value={revivesUsed > 0 ? `${formatCredits(revivesUsed * revivePrice)} cr` : "0 cr"}
        />
        <LiveStat label="本局净收支" value={`${net >= 0 ? "+" : ""}${formatCredits(net)} cr`} tone={net >= 0 ? "text-emerald-300" : "text-rose-300"} />
      </div>
      <p className="text-[9px] leading-relaxed text-white/30">
        奖励发放至临时余额，有效期 {rewardValidDays} 天 · 今日还可出击 {runsLeft} 次
      </p>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] leading-relaxed text-white/45">
        <p>
          <span className="text-white/70">拖动画面</span> 移动 · 自动射击 ·{" "}
          <span className="text-white/70">X / K / 空格</span> 炸弹 · <span className="text-white/70">P</span> 暂停
        </p>
        <p className="mt-0.5">
          <span className="text-white/70">当前武器</span> {WEAPONS[hud.weapon].name}（{hud.weapon}）Lv
          {hud.weaponLevel} · {describeWeapon(hud.weapon, hud.weaponLevel)}
        </p>
        <p className="mt-0.5 text-white/35">{WEAPONS[hud.weapon].hint}</p>
        <p className="mt-0.5">
          <span className="text-white/70">掉落</span> {BULLET_TYPES.map((t) => `${t} ${WEAPONS[t].name}`).join(" · ")}{" "}
          · B 炸弹 · 金色 cr 战利品
        </p>
        <p className="mt-0.5">同字母升级，别的字母切换并清空等级；打掉补给箱可重掷字母。</p>
      </div>
    </div>
  );
}

function LiveStat({
  label,
  value,
  icon: Icon,
  mono,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  mono?: boolean;
  highlight?: boolean;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
      <p className="flex items-center gap-1 text-[9px] text-white/40">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 truncate text-sm font-semibold text-white/90",
          mono && "font-mono",
          highlight && "text-cyan-200",
          tone,
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Chip({
  icon: Icon,
  text,
  muted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        muted
          ? "border-white/10 bg-white/[0.02] text-white/35"
          : "border-cyan-400/25 bg-cyan-400/[0.06] text-cyan-200/90",
      )}
    >
      <Icon className="h-3 w-3" />
      {text}
    </span>
  );
}

function RecordsPanel({ summary }: { summary: MyRaidenSummary }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
        <Stat label="单局最高分" value={summary.bestScore.toLocaleString("en-US")} />
        <Stat label="累计首通" value={`${summary.firstClears} / ${RAIDEN_STAGES.length} 关`} />
        <Stat label="累计通关奖励" value={`${formatCredits(summary.totalReward)} cr`} />
        <Stat label="累计出击" value={`${summary.totalRuns} 次`} />
      </div>

      <div className="space-y-1.5">
        {summary.stages.map((stage) => {
          const meta = RAIDEN_STAGES.find((s) => s.no === stage.stage);
          return (
            <div
              key={stage.stage}
              className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-white/85">
                  STAGE {stage.stage} · {meta?.name ?? stage.name}
                </p>
                <p className="truncate text-[10px] text-white/40">
                  {stage.firstClearedAt
                    ? `首通 ${formatCnDateTime(stage.firstClearedAt, {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : "尚未通关"}
                  {stage.bestScore > 0 ? ` · 最高 ${stage.bestScore.toLocaleString("en-US")} 分` : ""}
                </p>
              </div>
              <Badge tone={stage.firstClearedAt ? "success" : "muted"}>
                {stage.clears > 0 ? `通关 ${stage.clears} 次` : "未通关"}
              </Badge>
            </div>
          );
        })}
      </div>

      {summary.recentRuns.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-white/45">最近出击</p>
          {summary.recentRuns.map((run) => (
            <div
              key={run.id}
              className="flex items-center justify-between gap-2 text-[10px] text-white/45"
            >
              <span>
                {formatCnDateTime(run.startedAt, {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span>
                STAGE {Math.max(1, run.stage)} · {run.score.toLocaleString("en-US")} 分
              </span>
              <Badge
                tone={
                  run.status === "cleared"
                    ? "success"
                    : run.status === "failed"
                      ? "danger"
                      : run.status === "active"
                        ? "info"
                        : "muted"
                }
              >
                {runStatusText(run.status)}
              </Badge>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-[10px] text-white/35">
          还没有出击记录。第一次出击会写进这里。
        </p>
      )}
    </div>
  );
}

function runStatusText(status: string): string {
  if (status === "cleared") return "通关";
  if (status === "failed") return "阵亡";
  if (status === "active") return "进行中";
  if (status === "abandoned") return "放弃";
  return status;
}

function RankPanel({
  leaderboard,
  firstClears,
}: {
  leaderboard: LeaderboardRow[];
  firstClears: BigWinRow[];
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[10px] font-medium text-white/45">最高分排行榜</p>
        {leaderboard.length === 0 ? (
          <p className="rounded-md border border-white/10 bg-white/[0.03] py-5 text-center text-[10px] text-white/35">
            还没有人完成出击，榜首席位等你来拿。
          </p>
        ) : (
          <div className="space-y-1">
            {leaderboard.map((row) => (
              <div
                key={row.userId}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2 py-1 text-[11px]",
                  row.isMe ? "bg-cyan-400/10 text-white" : "text-white/55",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "w-4 text-center font-mono",
                      row.rank <= 3 && "font-bold text-amber-400",
                    )}
                  >
                    {row.rank}
                  </span>
                  <span className="truncate">{row.label}</span>
                  {row.isMe ? <Badge tone="info">我</Badge> : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono">{row.score.toLocaleString("en-US")}</span>
                  <span className="text-[9px] text-white/35">
                    {row.clearedAll ? "全通" : `ST${row.stage}`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-medium text-white/45">最新首通播报</p>
        {firstClears.length === 0 ? (
          <p className="rounded-md border border-white/10 bg-white/[0.03] py-4 text-center text-[10px] text-white/35">
            还没有首通记录。
          </p>
        ) : (
          <div className="space-y-1.5">
            {firstClears.map((row, index) => (
              <div
                key={`${row.label}-${row.createdAt}-${index}`}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="truncate text-white/70">
                  {row.label}
                  <span className="text-white/35"> 首通 STAGE {row.stageNo}</span>
                </span>
                <span className="shrink-0 font-mono text-amber-400/90">
                  +{formatCredits(row.reward)} cr
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RulesPanel({ config }: { config: RaidenConfig }) {
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-white/10">
        <table className="w-full text-left text-[10px]">
          <thead className="bg-white/[0.05] text-white/40">
            <tr>
              <th className="px-2.5 py-1.5 font-medium">关卡</th>
              <th className="px-2.5 py-1.5 font-medium">Boss</th>
              <th className="px-2.5 py-1.5 text-right font-medium">首通</th>
              <th className="px-2.5 py-1.5 text-right font-medium">重复</th>
            </tr>
          </thead>
          <tbody>
            {RAIDEN_STAGES.map((stage) => {
              const reward = stageRewardFor(config, stage.no);
              return (
                <tr key={stage.no} className="border-t border-white/5">
                  <td className="px-2.5 py-1.5">
                    <span className="font-mono text-[9px] text-white/35">ST{stage.no}</span>
                    <p className="text-white/80">{stage.name}</p>
                  </td>
                  <td className="px-2.5 py-1.5 text-white/45">{stage.boss}</td>
                  <td className="px-2.5 py-1.5 text-right font-mono text-amber-400/90">
                    {formatCredits(reward.firstClear)}
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-mono text-white/40">
                    {formatCredits(reward.repeat)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="space-y-1 text-[10px] leading-relaxed text-white/50">
        <li>· 每天最多出击 {config.dailyRuns} 次，装备费在出击时从余额扣除。</li>
        <li>
          · 首通奖励仅发放一次；重复通关奖励每日封顶 {formatCredits(config.repeatDailyCap)} cr。
        </li>
        <li>· 奖励以临时余额发放，有效期 {config.rewardValidDays} 天，可正常抵扣消费。</li>
        <li>
          · 阵亡后可花 {formatCredits(config.revivePriceCredits)} cr 原地复活，单局最多{" "}
          {config.maxRevives} 次。
        </li>
        <li>· 五种子弹同时只能装备一种：{BULLET_TYPES.map((t) => `${t} ${WEAPONS[t].name}`).join(" · ")}。</li>
        <li>· 吃到同字母 → 升到最高 Lv{MAX_WEAPON_LEVEL}，威力、弹数与范围一起涨；吃到别的字母 → 等级清空并切换成它。</li>
        <li>· 开火打掉漂浮的补给箱会让它重新随机字母，可以先洗掉不想要的类型（金色战利品箱不受影响）。</li>
        <li>· B 补充炸弹，金色 cr 是战利品；精英敌机与 Boss 的战利品在通关时并入本关奖励（有单关上限）。</li>
        <li>· 机体基础 100 HP：敌弹 -10，撞机/障碍 -34~50，HP 归零才损失一条命。</li>
        <li>· 每击破 25 架敌机 HP 回满；进入新关卡与复活同样回满。</li>
        <li>· 关卡顺序与用时由服务端校验；切到后台会自动暂停。</li>
        <li>· 排行榜按每位玩家的单局最高分排序，未通关的分数没有奖励。</li>
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
      <p className="text-[9px] text-white/40">{label}</p>
      <p className="mt-0.5 truncate font-mono text-sm font-semibold text-white/90">{value}</p>
    </div>
  );
}
