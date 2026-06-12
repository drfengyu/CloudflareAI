import { PageHeader, Placeholder } from "@/components/dashboard/page-header";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="设置" description="账户偏好与（可选）自带 Cloudflare 凭证" />
      <Placeholder note="P2/P5 实现：个人资料、主题、BYOK 凭证、配额展示" />
    </>
  );
}
