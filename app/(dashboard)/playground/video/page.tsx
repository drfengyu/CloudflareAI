import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";

export default function VideoPlaygroundPage() {
  return (
    <>
      <PageHeader
        title="视频生成"
        description="Cloudflare Workers AI 原生暂不支持视频生成"
        action={<Badge tone="warning">即将支持</Badge>}
      />
      <div className="m-8 rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-8 text-sm text-muted">
        <p className="mb-2 font-medium text-foreground">规划中</p>
        <p>
          Workers AI 模型目录目前不包含视频生成模型。后续将通过第三方
          provider（如 Replicate / fal.ai 的 Kling、Runway 等）接入，并在此处提供统一入口与用量记录。
        </p>
      </div>
    </>
  );
}
