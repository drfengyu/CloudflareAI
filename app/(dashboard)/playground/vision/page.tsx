import { PageHeader, Placeholder } from "@/components/dashboard/page-header";

export default function VisionPlaygroundPage() {
  return (
    <>
      <PageHeader title="图像理解" description="看图问答、图像描述、视觉推理" />
      <Placeholder note="P3 实现：上传图片 + 提问，多模态模型推理" />
    </>
  );
}
