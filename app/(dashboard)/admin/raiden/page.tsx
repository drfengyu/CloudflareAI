import { redirect } from "next/navigation";

/** 雷电逐笔明细已并入 `/admin/activity` 的按天汇总，旧入口保留跳转。 */
export default function AdminRaidenPage() {
  redirect("/admin/activity");
}
