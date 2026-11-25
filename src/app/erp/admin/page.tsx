import type { Metadata } from "next";
import { ErpAdminClient } from "@/components/erp/ErpAdminClient";
import { ErpPage } from "@/components/erp/ErpPage";

export const metadata: Metadata = {
  title: "ข้อมูลหลัก ERP | โรงพยาบาลบางระกำ",
  robots: { index: false, follow: false },
};

/** Master data + ERP roles. erp_admin / web-app admin (enforced by /api/erp/admin/*). */
export default function ErpAdminPage(props: PageProps<"/erp/admin">) {
  return (
    <ErpPage
      path="/erp/admin"
      title="ข้อมูลหลักและสิทธิ์ ERP"
      subtitle="หน่วยงาน คลัง หมวด/รายการพัสดุ ผู้ขาย บุคลากร บทบาทผู้ใช้"
      searchParams={props.searchParams}
    >
      <ErpAdminClient />
    </ErpPage>
  );
}
