"use server";

import { db } from "@/lib/db/d1-http";
import { options, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { revalidatePath } from "next/cache";
import { syncModelPricingWithSettings } from "@/lib/billing/model-pricing";
import { invalidateCreditsPerUsdCache } from "@/lib/billing/credits";
import { parseCnWallClock } from "@/lib/date";
import {
  LOTTERY_CONFIG_KEY,
  type LotteryConfig,
} from "@/lib/lottery/prize-math";
import {
  ANNOUNCEMENT_MAX,
  ANNOUNCEMENT_TYPES,
  FAQ_MAX,
  type AnnouncementInput,
  type FaqItem,
} from "@/lib/settings/dashboard-info";

async function upsertOption(key: string, value: string) {
  const existing = await db
    .select()
    .from(options)
    .where(eq(options.key, key))
    .limit(1);

  if (existing[0]) {
    await db.update(options).set({ value }).where(eq(options.key, key));
  } else {
    await db.insert(options).values({ key, value });
  }
}

export async function updateBasicSettings(formData: {
  siteName: string;
  defaultBalanceValidDays: string;
  creditsPerUsd: string;
}) {
  const currentUserId = await requireUser();

  // 检查权限
  const currentUser = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 10) {
    throw new Error("权限不足");
  }

  // 验证输入
  if (!formData.siteName.trim()) {
    throw new Error("站点名称不能为空");
  }

  const days = parseInt(formData.defaultBalanceValidDays);
  if (isNaN(days) || days <= 0) {
    throw new Error("有效期必须是正整数");
  }

  const ratio = parseFloat(formData.creditsPerUsd);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new Error("美元汇率必须 > 0");
  }

  // 更新设置
  await upsertOption("siteName", formData.siteName.trim());
  await upsertOption("defaultBalanceValidDays", formData.defaultBalanceValidDays);
  await upsertOption("creditsPerUsd", String(ratio));

  // 立即让 credits.ts 缓存失效，下次读取拿到新值
  invalidateCreditsPerUsdCache();

  revalidatePath("/admin/settings");
  // Sidebar brand lives in the dashboard layout — revalidate it so the name updates.
  revalidatePath("/", "layout");
  return { success: true };
}

export async function updatePricingSettings(formData: {
  baseMultiplier: string;
  adjustThreshold: string;
  adjustMultiplierLow: string;
  adjustMultiplierHigh: string;
  defaultPricePerMillion: string;
}) {
  const currentUserId = await requireUser();

  // 检查权限
  const currentUser = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 10) {
    throw new Error("权限不足");
  }

  // 验证输入
  const baseMultiplier = parseFloat(formData.baseMultiplier);
  const adjustThreshold = parseFloat(formData.adjustThreshold);
  const adjustMultiplierLow = parseFloat(formData.adjustMultiplierLow);
  const adjustMultiplierHigh = parseFloat(formData.adjustMultiplierHigh);
  const defaultPricePerMillion = parseFloat(formData.defaultPricePerMillion);

  if (isNaN(baseMultiplier) || baseMultiplier < 1) {
    throw new Error("基础倍率必须 ≥ 1");
  }
  if (isNaN(adjustThreshold) || adjustThreshold < 0) {
    throw new Error("价格阈值必须 ≥ 0");
  }
  if (isNaN(adjustMultiplierLow) || adjustMultiplierLow < 0.01) {
    throw new Error("低价倍率必须 ≥ 0.01");
  }
  if (isNaN(adjustMultiplierHigh) || adjustMultiplierHigh < 0.01) {
    throw new Error("高价倍率必须 ≥ 0.01");
  }
  if (isNaN(defaultPricePerMillion) || defaultPricePerMillion < 0) {
    throw new Error("默认价格必须 ≥ 0");
  }

  // 更新设置
  await upsertOption("pricing_base_multiplier", formData.baseMultiplier);
  await upsertOption("pricing_adjust_threshold", formData.adjustThreshold);
  await upsertOption("pricing_adjust_multiplier_low", formData.adjustMultiplierLow);
  await upsertOption("pricing_adjust_multiplier_high", formData.adjustMultiplierHigh);
  await upsertOption("pricing_default_price_per_million", formData.defaultPricePerMillion);

  // 重新同步价格表（使用新的配置）
  const result = await syncModelPricingWithSettings();

  revalidatePath("/admin/settings");
  revalidatePath("/admin/pricing");
  revalidatePath("/pricing");

  return {
    success: true,
    inserted: result.inserted,
    updated: result.updated,
  };
}

export async function updateCheckinSettings(formData: {
  enabled: boolean;
  minQuota: string;
  maxQuota: string;
  validDays: string;
}) {
  const currentUserId = await requireUser();

  // 检查权限
  const currentUser = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 10) {
    throw new Error("权限不足");
  }

  // 验证输入
  const minQuota = parseFloat(formData.minQuota);
  const maxQuota = parseFloat(formData.maxQuota);
  const validDays = parseInt(formData.validDays);

  if (isNaN(minQuota) || minQuota < 0) {
    throw new Error("最小奖励必须 ≥ 0");
  }
  if (isNaN(maxQuota) || maxQuota < 0) {
    throw new Error("最大奖励必须 ≥ 0");
  }
  if (minQuota > maxQuota) {
    throw new Error("最小奖励不能大于最大奖励");
  }
  if (isNaN(validDays) || validDays < 1) {
    throw new Error("有效期必须 ≥ 1 天");
  }

  // 更新设置
  await upsertOption("checkin_enabled", formData.enabled ? "true" : "false");
  await upsertOption("checkin_min_quota", formData.minQuota);
  await upsertOption("checkin_max_quota", formData.maxQuota);
  await upsertOption("checkin_valid_days", formData.validDays);

  revalidatePath("/admin/settings");
  revalidatePath("/wallet");

  return { success: true };
}

export async function updateAuthChannels(formData: {
  emailEnabled: boolean;
  githubEnabled: boolean;
  linuxdoEnabled: boolean;
}) {
  const currentUserId = await requireUser();

  // 检查权限
  const currentUser = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 10) {
    throw new Error("权限不足");
  }

  // 至少保留一个渠道
  if (!formData.emailEnabled && !formData.githubEnabled && !formData.linuxdoEnabled) {
    throw new Error("至少需要启用一个登录渠道");
  }

  // 更新设置
  await upsertOption("auth_email_enabled", formData.emailEnabled ? "true" : "false");
  await upsertOption("auth_github_enabled", formData.githubEnabled ? "true" : "false");
  await upsertOption("auth_linuxdo_enabled", formData.linuxdoEnabled ? "true" : "false");

  revalidatePath("/admin/settings");
  revalidatePath("/login");
  revalidatePath("/register");

  return { success: true };
}

export async function updateEpaySettings(formData: {
  enabled: boolean;
  apiUrl: string;
  pid: string;
  key: string;
  rate: string;
  minCny: string;
  maxCny: string;
}) {
  const currentUserId = await requireUser();

  // 检查权限
  const currentUser = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 10) {
    throw new Error("权限不足");
  }

  const rate = parseFloat(formData.rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("充值汇率必须 > 0");
  }
  const minCny = parseFloat(formData.minCny);
  const maxCny = parseFloat(formData.maxCny);
  if (!Number.isFinite(minCny) || minCny <= 0) {
    throw new Error("最低金额必须 > 0");
  }
  if (!Number.isFinite(maxCny) || maxCny < minCny) {
    throw new Error("最高金额必须 ≥ 最低金额");
  }
  if (formData.enabled && (!formData.apiUrl.trim() || !formData.pid.trim() || !formData.key.trim())) {
    throw new Error("启用在线充值需填写网关地址、商户 ID 和密钥");
  }

  await upsertOption("epay_enabled", formData.enabled ? "true" : "false");
  await upsertOption("epay_api_url", formData.apiUrl.trim());
  await upsertOption("epay_pid", formData.pid.trim());
  await upsertOption("epay_key", formData.key.trim());
  await upsertOption("recharge_rate", String(rate));
  await upsertOption("recharge_min", String(minCny));
  await upsertOption("recharge_max", String(maxCny));

  revalidatePath("/admin/settings");
  revalidatePath("/wallet");

  return { success: true };
}

export async function updateLinuxdoSettings(formData: {
  enabled: boolean;
  apiUrl: string;
  pid: string;
  key: string;
  rate: string;
  minCny: string;
  maxCny: string;
}) {
  const currentUserId = await requireUser();

  // 检查权限
  const currentUser = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 10) {
    throw new Error("权限不足");
  }

  const rate = parseFloat(formData.rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("积分汇率必须 > 0");
  }
  const minCny = parseFloat(formData.minCny);
  const maxCny = parseFloat(formData.maxCny);
  if (!Number.isFinite(minCny) || minCny <= 0) {
    throw new Error("最低积分必须 > 0");
  }
  if (!Number.isFinite(maxCny) || maxCny < minCny) {
    throw new Error("最高积分必须 ≥ 最低积分");
  }
  if (formData.enabled && (!formData.apiUrl.trim() || !formData.pid.trim() || !formData.key.trim())) {
    throw new Error("启用 LinuxDO 积分支付需填写网关地址、Client ID 和密钥");
  }

  await upsertOption("ldpay_enabled", formData.enabled ? "true" : "false");
  await upsertOption("ldpay_api_url", formData.apiUrl.trim());
  await upsertOption("ldpay_pid", formData.pid.trim());
  await upsertOption("ldpay_key", formData.key.trim());
  await upsertOption("ldpay_rate", String(rate));
  await upsertOption("ldpay_min", String(minCny));
  await upsertOption("ldpay_max", String(maxCny));

  revalidatePath("/admin/settings");
  revalidatePath("/wallet");

  return { success: true };
}

/** 看板底部三张卡片（公告 / 常见问答 / 服务可用性）的保存入口 */
export async function updateDashboardInfoSettings(formData: {
  announcements: AnnouncementInput[];
  faq: FaqItem[];
  uptimeEnabled: boolean;
  uptimeApiUrl: string;
}) {
  const currentUserId = await requireUser();

  // 检查权限
  const currentUser = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 10) {
    throw new Error("权限不足");
  }

  if (formData.announcements.length > ANNOUNCEMENT_MAX) {
    throw new Error(`公告最多 ${ANNOUNCEMENT_MAX} 条`);
  }
  if (formData.faq.length > FAQ_MAX) {
    throw new Error(`常见问答最多 ${FAQ_MAX} 条`);
  }

  const announcements: AnnouncementInput[] = [];
  for (const [i, item] of formData.announcements.entries()) {
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const content = typeof item.content === "string" ? item.content.trim() : "";
    const date = typeof item.date === "string" ? item.date.trim() : "";
    if (!title && !content && !date) continue; // 整行留空视为删除
    if (!title) throw new Error(`第 ${i + 1} 条公告缺少标题`);
    if (parseCnWallClock(date) === null) {
      throw new Error(`第 ${i + 1} 条公告的发布时间无效（应为 YYYY-MM-DD HH:mm）`);
    }
    if (title.length > 200) throw new Error(`第 ${i + 1} 条公告标题过长（≤200 字）`);
    if (content.length > 2000) throw new Error(`第 ${i + 1} 条公告正文过长（≤2000 字）`);
    announcements.push({
      title,
      ...(content ? { content } : {}),
      type: ANNOUNCEMENT_TYPES.includes(item.type) ? item.type : "default",
      date,
    });
  }

  const faq: FaqItem[] = [];
  for (const [i, item] of formData.faq.entries()) {
    const question = typeof item.question === "string" ? item.question.trim() : "";
    const answer = typeof item.answer === "string" ? item.answer.trim() : "";
    const link = typeof item.link === "string" ? item.link.trim() : "";
    if (!question && !answer) continue;
    if (!question) throw new Error(`第 ${i + 1} 条问答缺少问题`);
    if (!answer) throw new Error(`第 ${i + 1} 条问答缺少答案`);
    if (question.length > 200) throw new Error(`第 ${i + 1} 条问答问题过长（≤200 字）`);
    if (answer.length > 2000) throw new Error(`第 ${i + 1} 条问答答案过长（≤2000 字）`);
    if (link && !/^https?:\/\//.test(link)) {
      throw new Error(`第 ${i + 1} 条问答的链接需以 http(s):// 开头`);
    }
    faq.push({ question, answer, ...(link ? { link } : {}) });
  }

  const uptimeApiUrl = formData.uptimeApiUrl.trim();
  if (uptimeApiUrl && !/^https?:\/\//.test(uptimeApiUrl)) {
    throw new Error("Uptime 接口地址需以 http(s):// 开头（留空则自检本站端点）");
  }

  await upsertOption("dashboard_announcements", JSON.stringify(announcements));
  await upsertOption("dashboard_faq", JSON.stringify(faq));
  await upsertOption("uptime_enabled", formData.uptimeEnabled ? "true" : "false");
  await upsertOption("uptime_api_url", uptimeApiUrl);

  revalidatePath("/admin/settings");
  revalidatePath("/dashboard");

  return { success: true };
}

/** 转盘最多这么多扇区，再多扇形文字就叠在一起了。 */
const LOTTERY_MAX_SECTORS = 16;
const LOTTERY_MAX_MILESTONES = 12;

function requireNumber(value: unknown, label: string, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${label}需在 ${min} ~ ${max} 之间`);
  }
  return n;
}

/** 限时活动（幸运转盘）配置的保存入口 */
export async function updateLotterySettings(formData: {
  enabled: boolean;
  startAt: string;
  endAt: string;
  ticketPriceCredits: number;
  outerChancePercent: number;
  multiplierBase: string;
  prizeValidDays: number;
  innerPrizes: { credits: number; weight: number }[];
  outerPrizes: { kind?: string; multiplier: number; tickets?: number; weight: number }[];
  milestones: { draws: number; tickets: number }[];
}) {
  const currentUserId = await requireUser();

  const currentUser = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 10) {
    throw new Error("权限不足");
  }

  const startAt = formData.startAt.trim();
  const endAt = formData.endAt.trim();
  const startMs = parseCnWallClock(startAt);
  const endMs = parseCnWallClock(endAt);
  if (formData.enabled) {
    if (startMs === null) throw new Error("开始时间格式应为 YYYY-MM-DD HH:mm（北京时间）");
    if (endMs === null) throw new Error("结束时间格式应为 YYYY-MM-DD HH:mm（北京时间）");
    if (endMs <= startMs) throw new Error("结束时间必须晚于开始时间");
  }

  if (formData.multiplierBase !== "ticket" && formData.multiplierBase !== "batch") {
    throw new Error("倍数基数只能是单券价或本次总花费");
  }
  const multiplierBase = formData.multiplierBase;

  const innerPrizes = (formData.innerPrizes ?? [])
    .map((p, i) => ({
      credits: requireNumber(p?.credits, `内圈第 ${i + 1} 个奖品的 cr`, -1_000_000, 1_000_000),
      weight: requireNumber(p?.weight, `内圈第 ${i + 1} 个奖品的权重`, 0.1, 10_000),
    }))
    .filter((p) => Number.isFinite(p.credits));
  const outerPrizes = (formData.outerPrizes ?? [])
    .map((p, i) => {
      const weight = requireNumber(p?.weight, `外圈第 ${i + 1} 个奖品的权重`, 0.1, 10_000);
      // 两类奖品只校验各自用得上的那个字段，否则配赠券会被迫填一个多余的倍数。
      if (p?.kind === "tickets") {
        return {
          kind: "tickets" as const,
          multiplier: 0,
          tickets: Math.trunc(
            requireNumber(p?.tickets, `外圈第 ${i + 1} 个奖品的赠券张数`, 1, 1000),
          ),
          weight,
        };
      }
      return {
        kind: "credits" as const,
        multiplier: requireNumber(p?.multiplier, `外圈第 ${i + 1} 个奖品的倍数`, -1000, 1000),
        tickets: 0,
        weight,
      };
    })
    .filter((p) => (p.kind === "tickets" ? p.tickets > 0 : Number.isFinite(p.multiplier)));

  if (innerPrizes.length === 0) throw new Error("内圈至少要配 1 个奖品");
  if (outerPrizes.length === 0) throw new Error("外圈至少要配 1 个奖品");
  if (innerPrizes.length > LOTTERY_MAX_SECTORS) throw new Error(`内圈最多 ${LOTTERY_MAX_SECTORS} 个扇区`);
  if (outerPrizes.length > LOTTERY_MAX_SECTORS) throw new Error(`外圈最多 ${LOTTERY_MAX_SECTORS} 个扇区`);

  const milestones = (formData.milestones ?? [])
    .map((m, i) => ({
      draws: Math.trunc(requireNumber(m?.draws, `累抽档位第 ${i + 1} 行的次数`, 1, 1_000_000)),
      tickets: Math.trunc(requireNumber(m?.tickets, `累抽档位第 ${i + 1} 行的赠券数`, 1, 1000)),
    }))
    .filter((m, index, all) => {
      // 同档位重复会让「只发一次」的唯一索引判断变得含混，直接去重。
      return all.findIndex((x) => x.draws === m.draws) === index;
    })
    .sort((a, b) => a.draws - b.draws);
  if (milestones.length > LOTTERY_MAX_MILESTONES) {
    throw new Error(`累抽档位最多 ${LOTTERY_MAX_MILESTONES} 档`);
  }

  const config: LotteryConfig = {
    enabled: formData.enabled === true,
    startAt,
    endAt,
    ticketPriceCredits: requireNumber(formData.ticketPriceCredits, "单券价", 1, 1_000_000),
    outerChancePercent: requireNumber(formData.outerChancePercent, "外圈概率", 0, 100),
    multiplierBase,
    prizeValidDays: Math.trunc(requireNumber(formData.prizeValidDays, "奖品有效期", 1, 3650)),
    innerPrizes,
    outerPrizes,
    milestones,
  };

  await upsertOption(LOTTERY_CONFIG_KEY, JSON.stringify(config));

  revalidatePath("/admin/settings");
  revalidatePath("/lottery");

  return { success: true };
}
