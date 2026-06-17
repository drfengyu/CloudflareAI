import { redirect } from "next/navigation";
import { requireUser } from "@/lib/usage/meter";
import { db } from "@/lib/db/d1-http";
import { users, modelPricing } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/dashboard/page-header";
import { PricingManager } from "./pricing-manager";
import { fetchModelCatalog } from "@/lib/cloudflare/catalog";
import { getCreditsPerUsd } from "@/lib/billing/credits";

export const dynamic = "force-dynamic";

export default async function AdminPricingPage() {
  const userId = await requireUser();

  // 校验管理员权限
  const userRows = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRows[0] || userRows[0].role < 10) {
    redirect("/dashboard");
  }

  // 获取所有模型价格数据
  const [catalog, pricingRows, ratio] = await Promise.all([
    fetchModelCatalog(),
    db.select().from(modelPricing),
    getCreditsPerUsd(),
  ]);

  // 构建 pricingMap
  const pricingMap = new Map(
    pricingRows.map((row) => [
      row.modelId,
      {
        category: row.category,
        source: row.source,
        inputPrice: row.inputPrice,
        outputPrice: row.outputPrice,
        unit: row.unit,
        isImage: row.isImage === 1,
        fixedPrice: row.fixedPrice,
        multiplier: row.multiplier ?? 1.0,
        updatedAt: row.updatedAt,
      },
    ]),
  );

  // 合并 catalog + pricing 数据
  const models = catalog.map((model) => {
    const pricing = pricingMap.get(model.id);
    return {
      id: model.id,
      name: model.name,
      category: model.category,
      source: model.source,
      pricing,
    };
  });

  return (
    <>
      <PageHeader
        title="定价管理"
        description="调整模型定价倍率（基础价格 × 倍率 = 最终价格）"
      />
      <PricingManager models={models} ratio={ratio} />
    </>
  );
}
