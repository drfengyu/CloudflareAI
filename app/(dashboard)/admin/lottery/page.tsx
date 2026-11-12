import { redirect } from "next/navigation";

/** 转盘逐笔明细已并入 `/admin/activity` 的按天汇总，旧入口保留跳转。 */
export default function AdminLotteryPage() {
  redirect("/admin/activity");
}
