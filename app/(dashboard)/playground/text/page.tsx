import { PageHeader, Placeholder } from "@/components/dashboard/page-header";

export default function TextPlaygroundPage() {
  return (
    <>
      <PageHeader title="文本生成" description="大语言模型对话、推理、代码与函数调用" />
      <Placeholder note="P3 实现：流式聊天，模型选择，写入使用记录" />
    </>
  );
}
