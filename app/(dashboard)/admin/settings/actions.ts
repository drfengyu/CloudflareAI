"use server";

import { db } from "@/lib/db/d1-http";
import { options, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { revalidatePath } from "next/cache";
import { syncModelPricingWithSettings } from "@/lib/billing/model-pricing";

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

  // 更新设置
  await upsertOption("siteName", formData.siteName.trim());
  await upsertOption("defaultBalanceValidDays", formData.defaultBalanceValidDays);

  revalidatePath("/admin/settings");
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
