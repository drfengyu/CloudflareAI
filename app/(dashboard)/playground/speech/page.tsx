import { PageHeader, Placeholder } from "@/components/dashboard/page-header";

export default function SpeechPlaygroundPage() {
  return (
    <>
      <PageHeader
        title="语音"
        description="语音转文本（Whisper）与文本转语音（MeloTTS）"
      />
      <Placeholder note="P3 实现：ASR 上传音频转写 / TTS 文本合成音频" />
    </>
  );
}
