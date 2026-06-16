"use client";

import { Cpu, Zap, Shield } from "lucide-react";

export function BrandSection() {
  return (
    <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-center lg:px-24 lg:py-16">
      {/* 极简网格背景 */}
      <div className="absolute inset-0 bg-background">
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `
              linear-gradient(hsl(var(--foreground)) 1px, transparent 1px),
              linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)
            `,
            backgroundSize: "48px 48px",
          }}
        />
        {/* 微妙的渐变（仅用于深度） */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted/20" />
      </div>

      {/* 内容区 */}
      <div className="relative z-10 mx-auto max-w-lg space-y-16">
        {/* Logo + 价值主张 */}
        <div className="space-y-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border/50 bg-muted/30 shadow-sm">
            <Cpu className="h-9 w-9 text-foreground" strokeWidth={1.5} />
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-medium tracking-tight text-foreground">
              Cloudflare AI Console
            </h1>
            <p className="text-lg text-muted-foreground">
              企业级多模型 AI 网关
            </p>
          </div>
        </div>

        {/* 核心卖点（3 个） */}
        <div className="space-y-8">
          <div className="flex items-start gap-4">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/30">
              <Zap className="h-5 w-5 text-foreground" strokeWidth={1.5} />
            </div>
            <div className="space-y-1">
              <h3 className="font-medium text-foreground">78+ AI 模型</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                涵盖文本、图像、视觉、翻译
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/30">
              <Shield className="h-5 w-5 text-foreground" strokeWidth={1.5} />
            </div>
            <div className="space-y-1">
              <h3 className="font-medium text-foreground">OpenAI 协议兼容</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                无缝接入主流开发工具
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/30">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-foreground"
              >
                <path d="M3 3v18h18" />
                <path d="M18 17V9" />
                <path d="M13 17V5" />
                <path d="M8 17v-3" />
              </svg>
            </div>
            <div className="space-y-1">
              <h3 className="font-medium text-foreground">精确计量统计</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                按 token 实时计费与看板
              </p>
            </div>
          </div>
        </div>

        {/* 底部标识 */}
        <div className="border-t border-border/30 pt-8">
          <p className="text-xs text-muted-foreground/60">
            Powered by Cloudflare Workers AI
          </p>
        </div>
      </div>
    </div>
  );
}
