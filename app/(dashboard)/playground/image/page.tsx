import { PageHeader, Placeholder } from "@/components/dashboard/page-header";

export default function ImagePlaygroundPage() {
  return (
    <>
      <PageHeader title="文生图" description="由文本描述生成图像（FLUX 等）" />
      <Placeholder note="P3 实现：文生图，参数控制，结果画廊" />
    </>
  );
}
