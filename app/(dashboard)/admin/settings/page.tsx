import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db/d1-http";
import { users, options } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/usage/meter";
import { redirect } from "next/navigation";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const currentUserId = await requireUser();

  // 检查权限
  const currentUser = await db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .limit(1);

  if (!currentUser[0] || currentUser[0].role < 10) {
    redirect("/dashboard");
  }

  // 获取所有设置
  const allSettings = await db.select().from(options);

  // 转换为 key-value 对象
  const settings: Record<string, string> = {};
  allSettings.forEach((opt) => {
    settings[opt.key] = opt.value;
  });

  return (
    <>
      <PageHeader
        title="系统设置"
        description="管理平台配置、定价倍率、功能开关"
      />

      <div className="space-y-6 p-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">定价倍率</CardTitle>
          </CardHeader>
          <CardContent>
            <SettingsForm
              initialSettings={{
                priceMultiplierHosted: settings.priceMultiplierHosted || "1000",
                priceMultiplierProxied: settings.priceMultiplierProxied || "1",
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">所有设置（JSON 编辑器）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-surface-2 p-4">
              <pre className="text-xs">
                {JSON.stringify(settings, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
