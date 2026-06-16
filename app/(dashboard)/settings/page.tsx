import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/usage/meter";
import { db } from "@/lib/db/d1-http";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireUser();

  // 获取完整用户信息
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

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
              {user?.linuxdoId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">LinuxDO ID</span>
                  <span className="font-mono text-[11px]">{user.linuxdoId}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">邮箱</span>
                <span className="text-[11px]">{user?.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">昵称</span>
                <span className="text-[11px]">{user?.name}</span>
              </div>
              {user?.linuxdoTrustLevel !== null && user?.linuxdoTrustLevel !== undefined && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">LinuxDO 信任等级</span>
                  <span className="text-[11px]">TL{user.linuxdoTrustLevel}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
