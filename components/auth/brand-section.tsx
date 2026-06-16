import { Cpu, Zap, BarChart3, Shield } from "lucide-react";

export function BrandSection() {
  return (
    <div className="relative hidden lg:flex lg:flex-col lg:justify-center lg:p-12 lg:px-16">
      {/* 背景装饰 */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPgogICAgPGcgZmlsbD0iY3VycmVudENvbG9yIiBmaWxsLW9wYWNpdHk9IjAuMDIiPgogICAgICA8cGF0aCBkPSJNMzYgMzRjMC0xLjEwNS44OTUtMiAyLTJzMiAuODk1IDIgMi0uODk1IDItMiAyLTItLjg5NS0yLTJ6Ii8+CiAgICA8L2c+CiAgPC9nPgo8L3N2Zz4=')] opacity-40" />

      {/* 内容区 */}
      <div className="relative space-y-8">
        {/* Logo + 标题 */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Cpu className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Cloudflare AI Console
              </h1>
              <p className="text-sm text-muted-foreground">
                多模型 AI 网关
              </p>
            </div>
          </div>
          <p className="text-lg text-muted-foreground">
            基于 Cloudflare Workers AI 的智能 API 网关，支持 OpenAI 和 Anthropic 协议
          </p>
        </div>

        {/* 功能亮点 */}
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">78+ AI 模型</h3>
              <p className="text-sm text-muted-foreground">
                文本生成、图像生成、视觉理解、嵌入向量、翻译等多种能力
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">精确计量与数据看板</h3>
              <p className="text-sm text-muted-foreground">
                按 token 真实计费，实时统计用量趋势和模型分布
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">OpenAI / Anthropic 兼容</h3>
              <p className="text-sm text-muted-foreground">
                直接用于 Claude Code、Continue、Cursor 等开发工具
              </p>
            </div>
          </div>
        </div>

        {/* 底部装饰文字 */}
        <div className="pt-8">
          <p className="text-xs text-muted-foreground">
            Powered by Cloudflare Workers AI + Next.js 16
          </p>
        </div>
      </div>
    </div>
  );
}
