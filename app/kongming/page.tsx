import type { Metadata } from "next";
import KongmingGame from "@/components/kongming/kongming-game";

export const metadata: Metadata = {
  title: "诸葛孔明传 · 吞食天地２怀旧版",
  description: "按 Windows 桌面端全量复刻的《诸葛孔明传》，WASD 移动、J 确认、K 取消。",
};

export default function KongmingPage() {
  return <KongmingGame />;
}
