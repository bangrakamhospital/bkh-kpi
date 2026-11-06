import type { Metadata } from "next";
import { Sarabun } from "next/font/google";
import "./globals.css";

const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "BKH KPI | แดชบอร์ดตัวชี้วัดโรงพยาบาล",
  description:
    "แสดงผลตัวชี้วัด KPI ของโรงพยาบาล เช่น การคัดกรองเบาหวาน ความดันโลหิตสูง และมะเร็ง",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${sarabun.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
