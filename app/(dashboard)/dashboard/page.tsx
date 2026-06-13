import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/usage/meter";
import { Activity } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  try {
    const userId = await requireUser();

    return (
      <>
        <PageHeader
          title="用量总览"
          description="今日/本月调用次数、Neuron 消耗与配额余量"
        />
        <div className="space-y-6 p-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <Activity className="h-8 w-8 text-primary" />
                <div>
                  <h2 className="text-xl font-semibold">欢迎使用 Cloudflare AI Console</h2>
                  <p className="text-sm text-muted mt-2">
                    User ID: {userId}
                  </p>
                  <p className="text-sm text-muted mt-2">
                    Dashboard 正在维护中，请访问其他功能页面：
                  </p>
                  <ul className="mt-4 space-y-2 text-sm">
                    <li>• <a href="/models" className="text-primary hover:underline">模型目录</a> — 浏览 250+ 可用模型</li>
                    <li>• <a href="/playground/text" className="text-primary hover:underline">文本生成</a> — 在线对话测试</li>
                    <li>• <a href="/playground/image" className="text-primary hover:underline">图像生成</a> — AI 绘图</li>
                    <li>• <a href="/keys" className="text-primary hover:underline">API Keys</a> — 管理访问密钥</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    );
  } catch (error) {
    return (
      <div className="p-8">
        <Card className="border-red-500">
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold text-red-500 mb-4">Dashboard 加载错误</h2>
            <p className="text-sm text-muted mb-4">
              {error instanceof Error ? error.message : String(error)}
            </p>
            <a href="/models" className="text-primary hover:underline">
              访问模型目录 →
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }
}
