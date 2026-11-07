import { PageHeader } from "@/components/dashboard/page-header";
import { PageBody, PageSection } from "@/components/dashboard/section";
import { loadLedger } from "./actions";
import { LedgerCard } from "./ledger-card";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const overview = await loadLedger(1, "all");

  return (
    <>
      <PageHeader title="个人账本" description="按天汇总的收支、余额与过期作废" />

      <PageBody className="pt-2">
        <PageSection
          title="收支明细"
          subtitle="每天的收入、支出与净收支，点开看当天各类型小计"
          className="border-t-0 pt-0"
        >
          <LedgerCard initial={overview} />
        </PageSection>
      </PageBody>
    </>
  );
}
