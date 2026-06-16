"use client";

import { Cpu, Zap, BarChart3, Shield } from "lucide-react";

export function BrandSection() {
  return (
    <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-center lg:p-12 lg:px-16">
      {/* 网格背景 + 渐变遮罩（Vercel 风格） */}
      <div className="absolute inset-0 bg-background">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `
              linear-gradient(hsl(var(--border)) 1px, transparent 1px),
              linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)
            `,
            backgroundSize: "60px 60px",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(var(--primary)/0.15),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_hsl(var(--primary)/0.12),transparent_60%)]" />
      </div>

      {/* 浮动装饰卡片（CSS animation） */}
      <div className="absolute left-[10%] top-[15%] h-32 w-32 animate-float rounded-2xl border border-primary/20 bg-primary/5 shadow-xl backdrop-blur-sm" />
      <div className="absolute right-[15%] top-[35%] h-24 w-24 animate-float-delayed rounded-xl border border-primary/15 bg-primary/8 shadow-lg backdrop-blur-sm" />
      <div className="absolute bottom-[20%] left-[20%] h-28 w-28 animate-float-slow rounded-2xl border border-primary/10 bg-primary/6 shadow-lg backdrop-blur-sm" />
      <div className="absolute bottom-[30%] right-[10%] h-20 w-20 animate-float-delayed rounded-lg border border-primary/25 bg-primary/10 shadow-xl backdrop-blur-sm" />

      {/* 光晕装饰 */}
      <div className="absolute left-[20%] top-[25%] h-80 w-80 animate-pulse-slow rounded-full bg-primary/15 blur-[120px]" />
      <div className="absolute bottom-[15%] right-[18%] h-96 w-96 animate-pulse-slower rounded-full bg-primary/12 blur-[140px]" />

      {/* 内容区（玻璃态卡片） */}
      <div className="relative z-10 space-y-8 rounded-3xl border border-border/50 bg-background/40 p-10 shadow-2xl backdrop-blur-xl">
        {/* Logo + 标题 */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 shadow-lg backdrop-blur-sm ring-1 ring-primary/20">
              <Cpu className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                Cloudflare AI Console
              </h1>
              <p className="text-sm text-muted-foreground">
                多模型 AI 网关
              </p>
            </div>
          </div>
          <p className="text-lg leading-relaxed text-muted-foreground">
            基于 Cloudflare Workers AI 的智能 API 网关，支持 OpenAI 和 Anthropic 协议
          </p>
        </div>

        {/* 功能亮点（带悬浮效果） */}
        <div className="space-y-4">
          <div className="group flex items-start gap-3 rounded-xl p-3 transition-all hover:bg-primary/5">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 shadow-md ring-1 ring-primary/20 transition-transform group-hover:scale-110">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">78+ AI 模型</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                文本生成、图像生成、视觉理解、嵌入向量、翻译等多种能力
              </p>
            </div>
          </div>

          <div className="group flex items-start gap-3 rounded-xl p-3 transition-all hover:bg-primary/5">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 shadow-md ring-1 ring-primary/20 transition-transform group-hover:scale-110">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">精确计量与数据看板</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                按 token 真实计费，实时统计用量趋势和模型分布
              </p>
            </div>
          </div>

          <div className="group flex items-start gap-3 rounded-xl p-3 transition-all hover:bg-primary/5">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 shadow-md ring-1 ring-primary/20 transition-transform group-hover:scale-110">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">OpenAI / Anthropic 兼容</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                直接用于 Claude Code、Continue、Cursor 等开发工具
              </p>
            </div>
          </div>
        </div>

        {/* 底部装饰文字 */}
        <div className="border-t border-border/50 pt-6">
          <p className="text-xs text-muted-foreground/80">
            Powered by Cloudflare Workers AI + Next.js 16
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(-20px) rotate(3deg);
          }
        }
        @keyframes float-delayed {
          0%,
          100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(-15px) rotate(-2deg);
          }
        }
        @keyframes float-slow {
          0%,
          100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(-25px) rotate(2deg);
          }
        }
        @keyframes pulse-slow {
          0%,
          100% {
            opacity: 0.15;
          }
          50% {
            opacity: 0.25;
          }
        }
        @keyframes pulse-slower {
          0%,
          100% {
            opacity: 0.12;
          }
          50% {
            opacity: 0.20;
          }
        }

        :global(.animate-float) {
          animation: float 6s ease-in-out infinite;
        }
        :global(.animate-float-delayed) {
          animation: float-delayed 5s ease-in-out infinite 1s;
        }
        :global(.animate-float-slow) {
          animation: float-slow 7s ease-in-out infinite 0.5s;
        }
        :global(.animate-pulse-slow) {
          animation: pulse-slow 4s ease-in-out infinite;
        }
        :global(.animate-pulse-slower) {
          animation: pulse-slower 5s ease-in-out infinite 1s;
        }
      `}</style>
    </div>
  );
}
