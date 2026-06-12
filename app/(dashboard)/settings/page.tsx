import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/usage/meter";
import { getUserQuota } from "@/lib/usage/queries";
import { Zap, Info } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireUser();
  const quota = await getUserQuota(userId);

  return (
    <>
      <PageHeader title="设置" description="配额与账户设置" />
      <div className="space-y-4 p-8">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <h3 className="mb-1 text-sm font-medium">Neuron 配额</h3>
                <p className="mb-3 text-xs text-muted">
                  Cloudflare 按 Neuron（神经元）计费：每个模型调用消耗若干
                  Neuron，Workers AI 提供每日 10,000 Neuron 免费额度。
                </p>
                <div className="space-y-2 rounded-lg border border-border bg-surface p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted">每日限额</span>
                    <span className="font-medium">
                      {quota.dailyNeuronLimit.toLocaleString()} Neurons
                    </span>
                  </div>
                  {quota.monthlyNeuronLimit && (
                    <div className="flex justify-between">
                      <span className="text-muted">每月限额</span>
                      <span className="font-medium">
                        {quota.monthlyNeuronLimit.toLocaleString()} Neurons
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg bg-surface-2 p-3">
              <Info className="h-4 w-4 text-muted" />
              <div className="flex-1 text-xs text-muted">
                <p className="mb-1 font-medium">计费说明</p>
                <ul className="ml-3 list-disc space-y-1">
                  <li>
                    <strong>Hosted 模型</strong>（如 Llama 3.x / FLUX）：消耗
                    Neuron，享受每日免费额度
                  </li>
                  <li>
                    <strong>Proxied 模型</strong>（OpenAI / Anthropic
                    代理）：绕过免费额度直接计费
                  </li>
                  <li>
                    详情见{" "}
                    <a
                      href="https://developers.cloudflare.com/workers-ai/platform/pricing/"
                      target="_blank"
                      rel="noopener"
                      className="text-primary hover:underline"
                    >
                      官方定价文档
                    </a>
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
                <span className="text-muted">用户 ID</span>
                <span className="font-mono">{userId}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
