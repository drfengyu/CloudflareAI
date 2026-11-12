"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Timer, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CouponCount } from "@/components/activity/coupon-badge";
import { formatCredits } from "@/lib/billing/credits";
import { cn } from "@/lib/utils";
import { startTrialAction, submitTrialAction } from "@/app/(dashboard)/trial/actions";

interface TrialRun {
  runId: string;
  questions: { prompt: string }[];
  startedAt: number;
  expiresAt: number;
}

interface TrialResult {
  correct: number;
  total: number;
  reward: number;
  expired: boolean;
  already: boolean;
}

interface TrialGameProps {
  initialRun: TrialRun | null;
  runsToday: number;
  dailyRuns: number;
  questionCount: number;
  timeLimitSeconds: number;
  priceTickets: number;
  couponTickets: number;
  unitCredits: number;
  rewardValidDays: number;
  maxReward: number;
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function TrialGame(props: TrialGameProps) {
  const router = useRouter();
  const [run, setRun] = useState<TrialRun | null>(props.initialRun);
  const [runsToday, setRunsToday] = useState(props.runsToday);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() =>
    Array(props.initialRun?.questions.length ?? props.questionCount).fill(""),
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TrialResult | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!run) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [run]);

  const remainingMs = run ? run.expiresAt - now : 0;

  const submit = useCallback(
    async (answersToSend: string[]) => {
      if (!run || submittingRef.current) return;
      submittingRef.current = true;
      setBusy(true);
      const payload = run.questions.map((_, i) => {
        const raw = answersToSend[i]?.trim() ?? "";
        return raw === "" ? null : Number(raw);
      });
      const res = await submitTrialAction({ runId: run.runId, answers: payload });
      setBusy(false);
      submittingRef.current = false;
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setResult(res.data);
      setRun(null);
      setIndex(0);
      setAnswers(Array(props.questionCount).fill(""));
      if (res.data.reward > 0) {
        toast.success(`答对 ${res.data.correct} 题，获得 ${formatCredits(res.data.reward)} tcr`);
      } else {
        toast.message(res.data.expired ? "已超时，本局按 0 分结算" : "本局没有命中奖励档位");
      }
      router.refresh();
    },
    [props.questionCount, router, run],
  );

  useEffect(() => {
    if (run && remainingMs <= 0 && !submittingRef.current) {
      void submit(answers);
    }
  }, [answers, remainingMs, run, submit]);

  async function handleStart() {
    setBusy(true);
    setResult(null);
    const res = await startTrialAction();
    setBusy(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    const started = res.data;
    setRun({
      runId: started.runId,
      questions: started.questions,
      startedAt: started.startedAt,
      expiresAt: started.expiresAt,
    });
    setRunsToday(started.runsToday);
    setIndex(0);
    setAnswers(Array(started.questions.length).fill(""));
    setNow(Date.now());
    router.refresh();
  }

  function handleNext() {
    if (!run) return;
    if (index < run.questions.length - 1) {
      setIndex(index + 1);
      return;
    }
    void submit(answers);
  }

  if (!run) {
    const canStart = runsToday < props.dailyRuns && props.couponTickets >= props.priceTickets;
    return (
      <div className="space-y-3">
        {result ? (
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="flex items-center gap-2 text-base font-medium">
              <Trophy className="h-4 w-4 text-amber-500" />
              {result.expired ? "本局超时" : `答对 ${result.correct} / ${result.total} 题`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {result.reward > 0
                ? `获得 ${formatCredits(result.reward)} tcr，${props.rewardValidDays} 天内有效。`
                : result.already
                  ? "这一局之前已经结算过了。"
                  : "没有命中奖励档位，再试一局吧。"}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            每局 {props.questionCount} 题，限时 {props.timeLimitSeconds} 秒；本局票价{" "}
            <CouponCount kind="trial" count={props.priceTickets} />，最高可得{" "}
            {formatCredits(props.maxReward)} tcr。
          </p>
          <Button type="button" onClick={() => void handleStart()} disabled={busy || !canStart}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {result ? "再来一局" : "开始挑战"}
          </Button>
        </div>
        {!canStart ? (
          <p className="text-xs text-muted-foreground">
            {runsToday >= props.dailyRuns
              ? `今日 ${props.dailyRuns} 局已用完，明天再来。`
              : `试炼券不足：需要 ${props.priceTickets} 张，当前 ${props.couponTickets} 张，请在上方兑换。`}
          </p>
        ) : null}
      </div>
    );
  }

  const question = run.questions[index];
  const urgent = remainingMs <= 15_000;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          第 {index + 1} / {run.questions.length} 题
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 tabular-nums",
            urgent ? "font-semibold text-destructive" : "text-muted-foreground",
          )}
        >
          <Timer className="h-4 w-4" />
          {formatClock(remainingMs)}
        </span>
      </div>

      <div className="rounded-xl border border-border bg-secondary/30 p-6 text-center">
        <p className="text-3xl font-semibold tracking-wide tabular-nums">{question.prompt}</p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleNext();
        }}
        className="flex items-center gap-2"
      >
        <input
          key={index}
          autoFocus
          type="number"
          inputMode="numeric"
          value={answers[index]}
          onChange={(event) =>
            setAnswers((prev) => prev.map((value, i) => (i === index ? event.target.value : value)))
          }
          placeholder="输入答案"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-lg tabular-nums"
        />
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {index < run.questions.length - 1 ? "下一题" : "交卷"}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        答完可以直接交卷；空题按答错计。超时会自动按 0 分结算。
      </p>
    </div>
  );
}
