import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/usage/meter";
import { getUserBalance } from "@/lib/usage/queries";
import { Wallet, Info } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireUser();
  const balance = await getUserBalance(userId).catch(() => 0);
  const balanceUsd = balance / 100;

  return (
    <>
      <PageHeader title="设置" description="Credits 余额与账户设置" />
      <div className="space-y-4 p-8">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-start gap-3">
              <Wallet className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <h3 className="mb-1 text-sm font-medium">Credits 余额</h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  平台采用 Credits 预付费模式：100 credits = $1 USD。
                  每次调用根据模型和 token 数扣除相应 credits。
                </p>
                <div className="space-y-2 rounded-lg border border-border bg-surface p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">当前余额</span>
                    <span className="font-medium">{balance.toLocaleString()} credits</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">约合 USD</span>
                    <span className="font-medium">${balanceUsd.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg bg-surface-2 p-3">
              <Info className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 text-xs text-muted-foreground">
                <p className="mb-1 font-medium">计费说明</p>
                <ul className="ml-3 list-disc space-y-1">
                  <li>
                    <strong>Hosted 模型</strong>（Cloudflare 托管）：官方价格 × 10,000 倍率
                  </li>
                  <li>
                    <strong>Proxied 模型</strong>（第三方代理）：官方价格 × 1（透传）
                  </li>
                  <li>
                    示例：Llama 3.1 8B (hosted) ≈ 100 credits / 1K tokens
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

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
