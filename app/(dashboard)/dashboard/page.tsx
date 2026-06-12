import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CATEGORIES } from "@/lib/categories";
import { DAILY_FREE_NEURONS } from "@/lib/env";
import { formatNumber } from "@/lib/utils";

// P0: static placeholders. Real metrics arrive in P4 (usage monitoring).
const stats = [
  { label: "今日 Neurons", value: "—", hint: `/ ${formatNumber(DAILY_FREE_NEURONS)} 免费额度` },
  { label: "今日调用", value: "—", hint: "全部渠道" },
  { label: "今日费用估算", value: "—", hint: "超额部分" },
  { label: "可用模型", value: "78", hint: "Workers AI 目录" },
];

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="用量总览"
        description="Cloudflare Workers AI 控制台 · 在线生成、用量监控与 API 网关"
      />

      <div className="space-y-8 p-8">
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-5">
                <p className="text-xs text-muted">{s.label}</p>
                <p className="mt-1 text-2xl font-semibold">{s.value}</p>
                <p className="mt-1 text-[11px] text-muted">{s.hint}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted">在线生成</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.filter((c) => c.route).map((c) => (
              <Link key={c.id} href={c.route!}>
                <Card className="h-full transition-colors hover:border-[color:var(--primary)]">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{c.label}</CardTitle>
                    {c.comingSoon && <Badge tone="warning">即将支持</Badge>}
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted">{c.description}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
