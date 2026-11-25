import type { Metadata } from "next";
import { ErpPage } from "@/components/erp/ErpPage";
import { RequisitionPrint } from "@/components/erp/RequisitionPrint";

export const metadata: Metadata = {
  title: "พิมพ์ใบเบิก | ระบบ ERP | โรงพยาบาลบางระกำ",
  robots: { index: false, follow: false },
};

/** /erp/requisitions/print?id= : A4 print layout of one requisition. */
export default function RequisitionPrintPage(props: PageProps<"/erp/requisitions/print">) {
  return (
    <ErpPage path="/erp/requisitions/print" title="พิมพ์ใบเบิกพัสดุ" searchParams={props.searchParams}>
      <RequisitionPrint />
    </ErpPage>
  );
}
