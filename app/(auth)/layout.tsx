import { BrandSection } from "@/components/auth/brand-section";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* 左侧：品牌展示区（桌面端） */}
      <BrandSection />

      {/* 右侧：表单区 */}
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
