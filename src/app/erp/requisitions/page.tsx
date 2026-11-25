import type { Metadata } from "next";
import { ErpPage } from "@/components/erp/ErpPage";
import { RequisitionListClient } from "@/components/erp/RequisitionListClient";

export const metadata: Metadata = {
  title: "ใบเบิกพัสดุ | ระบบ ERP | โรงพยาบาลบางระกำ",
  robots: { index: false, follow: false },
};

export default function RequisitionsPage(props: PageProps<"/erp/requisitions">) {
  return (
    <ErpPage path="/erp/requisitions" title="ใบเบิกพัสดุ" searchParams={props.searchParams}>
      <RequisitionListClient />
    </ErpPage>
  );
}
