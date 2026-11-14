import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COUNTDOWN_SOON_MS,
  COUNTDOWN_URGENT_MS,
  activityCountdown,
  activityElapsedRatio,
  activityPhaseText,
  countdownTone,
  formatRemaining,
} from "../lib/activity/window";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

test("倒计时文案按天 / 小时 / 分钟分档", () => {
  assert.equal(formatRemaining(0), "已结束");
  assert.equal(formatRemaining(-5), "已结束");
  assert.equal(formatRemaining(30_000), "不足 1 分钟");
  assert.equal(formatRemaining(5 * MINUTE), "5 分钟");
  assert.equal(formatRemaining(HOUR), "1 小时");
  assert.equal(formatRemaining(HOUR + 20 * MINUTE), "1 小时 20 分");
  assert.equal(formatRemaining(DAY), "1 天");
  assert.equal(formatRemaining(2 * DAY + 3 * MINUTE), "2 天");
  assert.equal(formatRemaining(3 * DAY + 4 * HOUR), "3 天 4 小时");
});

test("紧急度：48 小时内提醒、6 小时内紧急", () => {
  assert.equal(countdownTone(COUNTDOWN_SOON_MS + 1), "normal");
  assert.equal(countdownTone(COUNTDOWN_SOON_MS), "soon");
  assert.equal(countdownTone(COUNTDOWN_URGENT_MS + 1), "soon");
  assert.equal(countdownTone(COUNTDOWN_URGENT_MS), "urgent");
  assert.equal(countdownTone(0), "urgent");
});

test("activityCountdown 只在进行中且配置了结束时间时返回", () => {
  const now = Date.UTC(2026, 10, 14, 12);
  assert.equal(
    activityCountdown({ status: "pending", startMs: now + HOUR, endMs: now + DAY }, now),
    null,
  );
  assert.equal(
    activityCountdown({ status: "ended", startMs: now - DAY, endMs: now - HOUR }, now),
    null,
  );
  assert.equal(activityCountdown({ status: "disabled", startMs: null, endMs: null }, now), null);
  assert.equal(activityCountdown({ status: "active", startMs: now - HOUR, endMs: null }, now), null);

  const active = activityCountdown(
    { status: "active", startMs: now - HOUR, endMs: now + 3 * HOUR + 5 * MINUTE },
    now,
  );
  assert.deepEqual(active, {
    text: "3 小时 5 分",
    tone: "urgent",
    msLeft: 3 * HOUR + 5 * MINUTE,
  });
});

test("窗口进度：未开始 0、进行中按比例、已结束 1", () => {
  const startMs = 1_000;
  const endMs = 3_000;
  assert.equal(activityElapsedRatio({ status: "pending", startMs, endMs }, 0), 0);
  assert.equal(activityElapsedRatio({ status: "active", startMs, endMs }, 2_000), 0.5);
  assert.equal(activityElapsedRatio({ status: "active", startMs, endMs }, 9_999), 1);
  assert.equal(activityElapsedRatio({ status: "ended", startMs, endMs }, 10_000), 1);
  assert.equal(activityElapsedRatio({ status: "disabled", startMs: null, endMs: null }, 10_000), 0);
  // 起点与终点相同（配置写反或未填）不画进度。
  assert.equal(activityElapsedRatio({ status: "active", startMs: endMs, endMs }, 10_000), 0);
});

test("状态文案与配置状态一致", () => {
  assert.equal(activityPhaseText("active"), "进行中");
  assert.equal(activityPhaseText("pending"), "未开始");
  assert.equal(activityPhaseText("ended"), "已结束");
  assert.equal(activityPhaseText("disabled"), "未开启");
});
