"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openFlipRound, revealFlipCard } from "@/app/(dashboard)/flip/actions";
import { formatCredits } from "@/lib/billing/credits";
import { formatFlipReward } from "@/lib/flip/config";
import type { FlipOutcome } from "@/lib/flip/store";
import { FlipCard } from "./flip-card";

export interface FlipBoardProps {
  /** 开一局的价格（cr 券面），来自当前活动配置。 */
  priceCredits: number;
  cardCount: number;
  rewardValidDays: number;
  /** 今日还能开几局。 */
  roundsLeft: number;
  dailyRounds: number;
  /** 当期活动券余额（cr 券面），开局只扣券。 */
  couponCredits: number;
  /** 12 格金额合计，用来解释「期望 = 合计 / 张数」。 */
  boardTotal: number;
  expectedPerRound: number;
  hitChancePercent: number;
  /** 上一局没翻完的牌，进页面就接上，不用重新付票价。 */
  pendingRound: { roundId: string; priceCredits: number } | null;
}

interface ActiveRound {
  roundId: string;
  priceCredits: number;
}

/**
 * 翻牌牌桌：一次一局，翻开一张就结算。
 *
 * 未翻开时前端只有「这里有 12 张牌」这一个事实——牌桌是服务端在扣款那一刻洗好落库的，
 * 答案随结算结果才下发，所以看不到「先拿答案再挑牌」。
 */
export function FlipBoard(props: FlipBoardProps) {
  const router = useRouter();
  const [round, setRound] = useState<ActiveRound | null>(props.pendingRound);
  const [outcome, setOutcome] = useState<FlipOutcome | null>(null);
  const [busy, setBusy] = useState<"open" | "reveal" | null>(null);

  const revealed = outcome?.board ?? null;

  async function onOpen() {
    if (busy) return;
    setBusy("open");
    const res = await openFlipRound();
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    setOutcome(null);
    setRound({ roundId: res.data.roundId, priceCredits: res.data.priceCredits });
    if (res.data.reused) toast.info("接着上一局没翻完的牌继续");
    router.refresh();
  }

  async function onFlip(position: number) {
    if (busy || !round || revealed) return;
    setBusy("reveal");
    const res = await revealFlipCard({ roundId: round.roundId, position });
    setBusy(null);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    setOutcome(res.data);
    router.refresh();
  }

  const insufficient = props.couponCredits < props.priceCredits;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <span>
            {revealed
              ? `本局翻开第 ${Number(outcome?.position ?? 0) + 1} 张 · ${formatFlipReward(Number(outcome?.reward ?? 0))}`
              : round
                ? `本局已付 ${round.priceCredits} cr 券面，挑一张翻开`
                  : `开一局 ${props.priceCredits} cr 券面`}
          </span>
          {outcome && Number(outcome.reward) > 0 ? (
            <span className="text-xs text-muted-foreground">
              （tcr 临时余额，{outcome.rewardValidDays} 天内有效）
            </span>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          可用券 {formatCredits(props.couponCredits)} cr · 今日剩余 {props.roundsLeft} / {props.dailyRounds} 局
        </div>
      </div>

      {/* 12 张排成 2 行 6 列：牌桌要一眼看全，不该被拉成占满整屏的大卡片。 */}
      <div className="mx-auto grid w-full max-w-2xl grid-cols-4 gap-2 sm:grid-cols-6">
        {Array.from({ length: props.cardCount }, (_, position) => (
          <FlipCard
            key={position}
            position={position}
            reward={revealed ? revealed[position] : null}
            picked={revealed ? outcome?.position === position : false}
            disabled={revealed !== null || round === null || busy !== null}
            onPick={() => void onFlip(position)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {revealed ? (
          <Button onClick={() => void onOpen()} disabled={busy !== null || props.roundsLeft <= 0 || insufficient}>
            {busy === "open" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            再来一局（{props.priceCredits} cr 券面）
          </Button>
        ) : round ? (
          <p className="text-sm text-muted-foreground">上面挑一张翻开，翻开即结算。</p>
        ) : (
          <Button onClick={() => void onOpen()} disabled={busy !== null || props.roundsLeft <= 0 || insufficient}>
            {busy === "open" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            开一局（{props.priceCredits} cr 券面）
          </Button>
        )}
        {!revealed && round === null && props.roundsLeft <= 0 ? (
          <span className="text-xs text-muted-foreground">今日开局次数已用完，明天再来。</span>
        ) : null}
        {insufficient && props.roundsLeft > 0 ? (
          <span className="text-xs text-muted-foreground">
            活动券不足，还差 {formatCredits(props.priceCredits - props.couponCredits)} cr，请在上方先兑换。
          </span>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        牌桌共 {props.cardCount} 张，奖项合计 {formatCredits(props.boardTotal)} tcr，
        每局期望 {formatCredits(props.expectedPerRound)} tcr（= 合计 ÷ {props.cardCount}），
        中奖概率 {props.hitChancePercent}%。位置与奖项的对应关系是开局时洗出来的，
        洗完直接落库，翻开前不告诉任何人。
      </p>
    </div>
  );
}
