import type { Metadata } from "next";
import { ErpPage } from "@/components/erp/ErpPage";
import { RequisitionFormClient } from "@/components/erp/RequisitionFormClient";

export const metadata: Metadata = {
  title: "สร้าง/แก้ไขใบเบิก | ระบบ ERP | โรงพยาบาลบางระกำ",
  robots: { index: false, follow: false },
};

/** New draft; ?id= edits an existing draft. */
export default function NewRequisitionPage(props: PageProps<"/erp/requisitions/new">) {
  return (
    <ErpPage path="/erp/requisitions/new" title="สร้าง/แก้ไขใบเบิกพัสดุ" searchParams={props.searchParams}>
      <RequisitionFormClient />
    </ErpPage>
  );
}
