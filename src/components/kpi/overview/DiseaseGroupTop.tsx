import type { DiseaseGroups } from "@/lib/kpi/overview-types";
import { DiseaseGroupCard } from "./DiseaseGroupCard";
import { IpdDiseaseGroupCard } from "./IpdDiseaseGroupCard";

/** Top 10 disease groups: OPD (รง.504) and IPD (รง.505), side by side. */
export function DiseaseGroupTop({ groups }: { groups: DiseaseGroups }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DiseaseGroupCard
        title="10 อันดับกลุ่มโรค ผู้ป่วยนอก"
        source="กลุ่มโรค รง.504 ตามวินิจฉัยหลัก (วันที่รับบริการ)"
        unit="ครั้ง"
        ranking={groups.opd}
        unclassifiedNote="รหัส Z ตรวจสุขภาพ/รับวัคซีน/ติดตามอาการ, รหัส U ฯลฯ"
        uncodedLabel="ยังไม่ลงวินิจฉัยหลัก"
      />
      <IpdDiseaseGroupCard admit={groups.ipdAdmit} discharge={groups.ipd} />
    </div>
  );
}
