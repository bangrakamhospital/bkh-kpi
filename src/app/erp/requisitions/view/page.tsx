import type { Metadata } from "next";
import { ErpPage } from "@/components/erp/ErpPage";
import { RequisitionDetailClient } from "@/components/erp/RequisitionDetailClient";

export const metadata: Metadata = {
  title: "รายละเอียดใบเบิก | ระบบ ERP | โรงพยาบาลบางระกำ",
  robots: { index: false, follow: false },
};

/**
 * /erp/requisitions/view?id= (query instead of a [id] segment: with Cache
 * Components a dynamic segment needs generateStaticParams).
 */
export default function RequisitionViewPage(props: PageProps<"/erp/requisitions/view">) {
  return (
    <ErpPage path="/erp/requisitions/view" title="รายละเอียดใบเบิกพัสดุ" searchParams={props.searchParams}>
      <RequisitionDetailClient />
    </ErpPage>
  );
}
