"use server";

import { db } from "@/lib/db/d1-http";
import { options, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { revalidatePath } from "next/cache";

export async function updatePricingSettings(formData: {
  priceMultiplierHosted: string;
  priceMultiplierProxied: string;
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
  const hostedMultiplier = parseFloat(formData.priceMultiplierHosted);
  const proxiedMultiplier = parseFloat(formData.priceMultiplierProxied);

  if (isNaN(hostedMultiplier) || hostedMultiplier <= 0) {
    throw new Error("Hosted 倍率必须是正数");
  }

  if (isNaN(proxiedMultiplier) || proxiedMultiplier <= 0) {
    throw new Error("Proxied 倍率必须是正数");
  }

  // 更新或插入设置
  const existingHosted = await db
    .select()
    .from(options)
    .where(eq(options.key, "priceMultiplierHosted"))
    .limit(1);

  const existingProxied = await db
    .select()
    .from(options)
    .where(eq(options.key, "priceMultiplierProxied"))
    .limit(1);

  if (existingHosted[0]) {
    await db
      .update(options)
      .set({ value: formData.priceMultiplierHosted })
      .where(eq(options.key, "priceMultiplierHosted"));
  } else {
    await db.insert(options).values({
      key: "priceMultiplierHosted",
      value: formData.priceMultiplierHosted,
    });
  }

  if (existingProxied[0]) {
    await db
      .update(options)
      .set({ value: formData.priceMultiplierProxied })
      .where(eq(options.key, "priceMultiplierProxied"));
  } else {
    await db.insert(options).values({
      key: "priceMultiplierProxied",
      value: formData.priceMultiplierProxied,
    });
  }

  revalidatePath("/admin/settings");
  return { success: true };
}
