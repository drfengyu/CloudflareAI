import { PageHeader, Placeholder } from "@/components/dashboard/page-header";

export default function HistoryPage() {
  return (
    <>
      <PageHeader title="使用记录" description="按时间查看你的全部调用与消耗" />
      <Placeholder note="P4 实现：分页表格，模型/渠道/状态/Neurons/费用" />
    </>
  );
}
