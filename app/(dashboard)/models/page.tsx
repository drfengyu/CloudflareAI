import { PageHeader, Placeholder } from "@/components/dashboard/page-header";

export default function ModelsPage() {
  return (
    <>
      <PageHeader
        title="模型库"
        description="浏览 Workers AI 全部模型，按功能分类、查看定价与能力"
      />
      <Placeholder note="P1 实现：从 /ai/models/search 同步并按分类展示 ~78 个模型" />
    </>
  );
}
