import { PageHeader, Placeholder } from "@/components/dashboard/page-header";

export default function KeysPage() {
  return (
    <>
      <PageHeader
        title="API 密钥"
        description="签发用于 Claude Code / Codex / Hermes 等工具的密钥"
      />
      <Placeholder note="P5 实现：创建/吊销密钥，展示前缀与最近使用时间" />
    </>
  );
}
