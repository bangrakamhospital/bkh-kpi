import type { Metadata } from "next";
import { ErpHomeClient } from "@/components/erp/ErpHomeClient";
import { ErpPage } from "@/components/erp/ErpPage";

export const metadata: Metadata = {
  title: "ระบบ ERP | โรงพยาบาลบางระกำ",
  robots: { index: false, follow: false },
};

export default function ErpHomePage(props: PageProps<"/erp">) {
  return (
    <ErpPage path="/erp" title="งานของฉัน" subtitle="คน-เงิน-ของ: ใบเบิกพัสดุและคลัง" searchParams={props.searchParams}>
      <ErpHomeClient />
    </ErpPage>
  );
}
