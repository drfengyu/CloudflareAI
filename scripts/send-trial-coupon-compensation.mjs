#!/usr/bin/env node
/**
 * 一次性补偿：给所有未删除用户发一封站内信，附件是 4 张当前轮次的每日试炼活动券。
 *
 * 取代 v0.57.2 那笔按人发放的 800 cr 站内信补偿（`trial-save-fix-20261114-5c7dcb78`）：
 * 这次改为全站发放同一张券，用户在游戏内的「活动券」入口即可看到并领取。
 *
 * 幂等：消息 id 固定为 `trial-save-fix-20261114-<userId>`，重复执行命中主键后
 * 被 INSERT OR IGNORE 丢弃，不会重复发券。
 *
 * Usage:
 *   node scripts/send-trial-coupon-compensation.mjs           # 只统计，不写库
 *   node scripts/send-trial-coupon-compensation.mjs --apply   # 写入 D1
 *   node scripts/send-trial-coupon-compensation.mjs --apply --force  # 活动已结束也照发
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) process.env[match[1]] = match[2].trim();
  });
}

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_D1_DATABASE_ID = process.env.CF_D1_DATABASE_ID;
if (!CF_ACCOUNT_ID || !CF_API_TOKEN || !CF_D1_DATABASE_ID) {
  console.error("❌ 缺少 CF_ACCOUNT_ID / CF_API_TOKEN / CF_D1_DATABASE_ID（检查 .env.local）");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

const COMPENSATION_ID = "trial-save-fix-20261114";
const TICKETS = 4;

// 与 lib/activity/coupons.ts 的 COUPON_NAMES.trial 保持顺序一致。
const TRIAL_COUPON_NAMES = ["试金券", "晨星券", "破晓券", "砺心券", "明镜券", "启程券"];

/** 与 lib/activity/coupons.ts 的 couponNameFor 同一套 FNV-1a，券名必须逐字节一致。 */
function couponNameFor(kind, activityKey) {
  const pool = TRIAL_COUPON_NAMES;
  if (!activityKey) return pool[0];
  let hash = 2166136261;
  const source = `${kind}:${activityKey}`;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return pool[Math.abs(hash) % pool.length];
}

const round2 = (v) => Math.round(v * 100) / 100;

async function d1Request(sql, params = []) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_D1_DATABASE_ID}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const msg = (body?.errors || []).map((e) => e.message).join("; ") || `D1 请求失败 (${res.status})`;
    throw new Error(msg);
  }
  return body.result?.[0];
}

async function d1Query(sql, params = []) {
  return (await d1Request(sql, params))?.results ?? [];
}

async function main() {
  const optionRows = await d1Query("SELECT value FROM option WHERE key = 'trial_config'");
  let config = {};
  try {
    config = JSON.parse(optionRows[0]?.value ?? "{}") ?? {};
  } catch {
    throw new Error("option.trial_config 不是合法 JSON");
  }

  const activityKey = typeof config.startAt === "string" ? config.startAt.trim() : "";
  const unitCredits = Number(config.couponUnitCredits) > 0 ? Number(config.couponUnitCredits) : 5;
  if (!activityKey) throw new Error("试炼活动没有开始时间（activityKey 为空），无法确定发放哪一轮券");

  const endMs = config.endAt ? new Date(`${String(config.endAt).trim().replace(" ", "T")}:00+08:00`).getTime() : NaN;
  if (!FORCE && Number.isFinite(endMs) && Date.now() >= endMs) {
    throw new Error(`试炼活动已于 ${config.endAt} 结束，券发出去也已作废；确认要发请加 --force`);
  }

  const couponName = couponNameFor("trial", activityKey);
  const credits = round2(TICKETS * unitCredits);
  const title = "存档回档补偿：4 张活动券";
  const body = [
    "三国讨逆传此前的存档回档问题已修复：平定后回城不再把等级、装备与城内购买清空。",
    `为表达歉意，我们给每位用户补发 ${TICKETS} 张当期「${couponName}」（券面单价 ${unitCredits} cr，共 ${credits} cr）。`,
    "领取后券会直接进账，可在游戏内的「活动券」入口兑换，或用于出城与购买；当期活动结束后作废。",
  ].join("\n\n");

  const attachment = JSON.stringify({
    activityKind: "trial",
    activityKey,
    couponName,
    unitCredits,
    tickets: TICKETS,
    credits,
  });

  const users = await d1Query("SELECT id, email FROM user WHERE status <> 3");
  const already = await d1Query(
    "SELECT COUNT(*) AS n FROM message WHERE id LIKE ?",
    [`${COMPENSATION_ID}:%`],
  );
  const alreadyCount = Number(already[0]?.n ?? 0);

  console.log(`活动轮次：${activityKey}（${couponName}，${unitCredits} cr/张）`);
  console.log(`补偿内容：${TICKETS} 张券 ≈ ${credits} cr`);
  console.log(`目标用户：${users.length} 人（status <> 3）`);
  console.log(`已发放：${alreadyCount} 封（幂等 id 前缀 ${COMPENSATION_ID}:）`);
  console.log(APPLY ? "模式：写入 D1" : "模式：仅统计（加 --apply 才写库）");

  if (!APPLY) return;

  const now = Date.now();
  let inserted = 0;
  let failed = 0;
  for (const [index, user] of users.entries()) {
    try {
      const result = await d1Request(
        `INSERT OR IGNORE INTO message
           (id, userId, kind, title, body, attachmentKind, attachment, sentBy, readAt, claimedAt, createdAt)
         VALUES (?, ?, 'reward', ?, ?, 'coupon', ?, NULL, NULL, NULL, ?)`,
        [`${COMPENSATION_ID}:${user.id}`, user.id, title, body, attachment, now],
      );
      inserted += result?.meta?.changes ?? 0;
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${user.id} (${user.email ?? "-"}): ${err.message}`);
    }
    if ((index + 1) % 100 === 0) console.log(`  进度 ${index + 1}/${users.length}`);
  }

  console.log(`✅ 新写入 ${inserted} 封，跳过（已存在）${users.length - inserted - failed} 封，失败 ${failed} 封`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("❌ 补偿发放失败：", err.message);
  process.exit(1);
});
