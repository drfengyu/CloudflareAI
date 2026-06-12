import { PageHeader, Placeholder } from "@/components/dashboard/page-header";

export default function EmbeddingsPlaygroundPage() {
  return (
    <>
      <PageHeader title="嵌入" description="文本向量化，用于检索、聚类、RAG" />
      <Placeholder note="P3 实现：文本转向量，维度展示与相似度计算" />
    </>
  );
}
