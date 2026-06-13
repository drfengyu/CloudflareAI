import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function VideoPage() {
  return (
    <>
      <PageHeader title="视频生成" description="文本/图像转视频（计划集成第三方 API）" />
      <div className="p-8">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center gap-2">
              <Badge tone="muted">规划中</Badge>
              <p className="text-sm text-muted-foreground">
                Cloudflare Workers AI 暂未提供视频生成模型
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              视频生成需要大量 GPU 算力，建议通过第三方 API 集成：
            </p>
            <ul className="ml-4 space-y-2 text-xs text-muted-foreground">
              <li>
                • <a href="https://fal.ai/models/fal-ai/runway-gen3/alpha/turbo/image-to-video" target="_blank" rel="noopener" className="text-primary hover:underline">
                  fal.ai/runway-gen3
                </a> — 图片转视频（15-60 秒）
              </li>
              <li>
                • <a href="https://replicate.com/models?query=video" target="_blank" rel="noopener" className="text-primary hover:underline">
                  replicate.com
                </a> — 多种开源视频生成模型
              </li>
              <li>
                • <a href="https://lumalabs.ai/dream-machine" target="_blank" rel="noopener" className="text-primary hover:underline">
                  Luma Dream Machine
                </a> — 文本转视频
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">
              后续版本可能将 API 密钥管理（P2）扩展为多服务集成，统一调用视频生成端点。
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
