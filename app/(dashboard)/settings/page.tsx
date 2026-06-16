import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/usage/meter";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireUser();

  return (
    <>
      <PageHeader title="设置" description="账户设置与信息" />
      <div className="space-y-4 p-8">
        <Card>
          <CardContent className="pt-5">
            <h3 className="mb-3 text-sm font-medium">账户信息</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">用户 ID</span>
                <span className="font-mono text-[11px]">{userId}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
