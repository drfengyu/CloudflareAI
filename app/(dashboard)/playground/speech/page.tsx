import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SpeechPage() {
  return (
    <>
      <PageHeader title="语音" description="语音转文本 (STT) / 文本转语音 (TTS)" />
      <div className="p-8">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center gap-2">
              <Badge tone="warning">开发中</Badge>
              <p className="text-sm text-muted">
                语音功能即将推出，将支持 Whisper (STT) 和 Kokoro/Parler (TTS) 模型
              </p>
            </div>
            <p className="text-xs text-muted">
              Cloudflare Workers AI 当前语音模型较少，后续版本将集成：
            </p>
            <ul className="ml-4 space-y-1 text-xs text-muted">
              <li>• <strong>语音转文本</strong>：上传音频文件 → 识别为文本</li>
              <li>• <strong>文本转语音</strong>：输入文本 + 选择音色 → 生成语音</li>
            </ul>
            <p className="text-xs text-muted">
              如需立即使用，可调用 <code className="rounded bg-surface-2 px-1">@cf/openai/whisper</code> 或第三方 API。
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
