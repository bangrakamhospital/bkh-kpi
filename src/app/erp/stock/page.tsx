import type { Metadata } from "next";
import { ErpPage } from "@/components/erp/ErpPage";
import { StockClient } from "@/components/erp/StockClient";

export const metadata: Metadata = {
  title: "คลังพัสดุ | ระบบ ERP | โรงพยาบาลบางระกำ",
  robots: { index: false, follow: false },
};

export default function StockPage(props: PageProps<"/erp/stock">) {
  return (
    <ErpPage
      path="/erp/stock"
      title="คลังพัสดุ"
      subtitle="คงคลัง รับเข้า ประวัติเคลื่อนไหว ปรับปรุงยอด"
      searchParams={props.searchParams}
    >
      <StockClient />
    </ErpPage>
  );
}
