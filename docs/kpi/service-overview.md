# ผู้รับบริการ (Service overview) — definitions

Tab "ผู้รับบริการ" at `/`. Source: **HOSxP only** (bkhosxp, MariaDB 10.11).
Data layer: `src/lib/kpi/overview.ts` (`getServiceOverview`), SQL:
`src/lib/kpi/sql/overview-hosxp.ts`, range logic (client-safe):
`src/lib/kpi/overview-range.ts`, contract: `src/lib/kpi/overview-types.ts`.
Verified with db-cli on 2026-11-12. Aggregates only — no hn/name/cid is
returned.

## Date range

| preset | from .. to (Asia/Bangkok, inclusive) |
|---|---|
| `today` (default) | today .. today |
| `yesterday` | today-1 .. today-1 |
| `7d` | today-6 .. today |
| `month` | 1st of this month .. today |
| `fiscal` | 1 Oct of the current Thai fiscal year .. today |
| `custom` | `from`/`to` ISO; invalid -> today; swapped if from > to; clamped to [2015-01-01, today]; max 366 days (keeps `to`) |

**Previous period** (`prevFrom..prevTo`) = the same number of days
immediately before `from` (today -> yesterday; month 1–12 Nov -> 20–31 Oct;
fiscal 1 Oct–12 Nov -> 19 Aug–30 Sep). It is NOT "same period last year".

All date predicates are `col BETWEEN :from AND :to` on indexed date columns
(EXPLAIN: range scans on `ovst.ix_vstdate_curdep`, `er_regist.ix_vstdate`,
`ipt.regdate`).

## Cards

| metric | definition | tables |
|---|---|---|
| ผู้รับบริการ (คน) `patients` | `COUNT(DISTINCT hn)` of OPD visits in range (a person with several visits in a multi-day range counts once) | `ovst.vstdate` |
| OPD (ครั้ง) `opdVisits` | `COUNT(*)` of visits in range. Includes ER/PCU visits and visits that led to an admission (`ovst.an` not null). Cancelled visits need no filter: HOSxP moves them from `ovst` to `ovst_cancel` (0 overlap in FY2570) | `ovst` |
| ER (ครั้ง) `er` | `er_regist` rows with `vstdate` in range whose `vn` still exists in `ovst` (all ER registrations, not only urgent triage levels) | `er_regist`, `ovst` |
| Admit ใหม่ `admitNew` | `ipt.regdate` in range, all wards **including home ward** | `ipt` |
| ผู้ป่วยในขณะนี้ `inpatientNow` | current admissions `ipt.dchdate IS NULL`, joined to `ward` (drops 10 stale 2024 rows with `ward` NULL), **excluding home ward**. Not range-dependent | `ipt`, `ward` |
| เตียง `bedTotal` | sum of `ward.bedcount` over the wards in `wards` (active wards + inactive wards that still have patients), excluding home ward. `bedcount` = `real_bedcount` at this site | `ward` |
| Home ward `homeWardNow` | current admissions in the home ward | `ipt`, `ward` |

Occupancy % (UI) = `inpatientNow / bedTotal`.

**Home ward**: HOSxP here has no home-ward flag (searched
`information_schema` for `%home%ward%` / `is_home%` columns — none). It is
identified by ward name `Home ward` (ward code `17`, spclty 09, 20 beds on
paper); `isHomeWard()` matches the name (`/home\s*ward|โฮมวอร์ด/i`) or
code in `HOME_WARD_CODES = ["17"]`. Home ward is removed from `wards`.

## Charts

- **hourly**: visits in range by `HOUR(ovst.vsttime)`, 24 entries 0..23 (zeros filled).
- **departments**: visits by `ovst.main_dep`, label from
  `kskdepartment.department`, which at this site already starts with
  `NNN-` (e.g. `062-จุดซักประวัติโรคไม่ติดต่อเรื้อรัง`); otherwise the label
  is `code-name`. Disabled departments show as `ปิดใช้งาน-NNN-...`. Sorted by
  visits desc, all departments (UI groups top 15 + อื่นๆ).
- **pttypes**: visits by the visit's right `ovst.pttype -> pttype.hipdata_code`
  (NHSO main fund), grouped (`PTTYPE_GROUPS` in overview.ts):

  | code | label | hipdata_code |
  |---|---|---|
  | UC | สิทธิ UC | UCS |
  | OFC | สิทธิข้าราชการ | OFC |
  | SSS | สิทธิประกันสังคม | SSS, SSI |
  | LGO | สิทธิ อปท | LGO |
  | CSH | ชำระเงิน | CSH |
  | INS | พ.ร.บ.ผู้ประสบภัยจากรถ | INS |
  | NR | สิทธิต่างด้าว | NRD, NRH |
  | GOV | สิทธิเบิกหน่วยงานอื่น | BKK, BMT, SRT, PTY, PVT, STP, A2 |
  | OTHER | อื่นๆ/ไม่ระบุ | anything else / empty |

  Alternatives checked: `pttype.pcode` (18 card types, e.g. ผู้สูงอายุ/อสม. —
  too fine and not "fund"), `pttype_eclaim_id` (15 claim types). hipdata_code
  is closest to the reference screenshot (~8 groups).
  Performance: ovst is aggregated by pttype in a derived table first;
  a direct `ovst JOIN pttype` made the optimizer scan via `ovst.ix_pttype`
  (~20 s for 6 weeks vs ~0.25 s).
- **ageSex**: distinct patients (hn) in range. Age = `vn_stat.age_y` of the
  patient's youngest visit in range (= age at first visit); sex =
  `vn_stat.sex` (1 male, 2 female; 100 % filled in FY2570). Bands 0-4, 5-14,
  15-24, 25-34, 35-44, 45-54, 55-64, 65-74, 75+. Totals equal `patients`.

## Verified figures (db-cli, 2026-11-12 ~09:15)

| | today 12 Nov | yesterday 11 Nov | FY2570 1 Oct–12 Nov |
|---|---|---|---|
| patients | 419 | 747 | 15,864 |
| opdVisits | 419 | 819 | 25,328 |
| er | 15 | 92 | 4,305 |
| admitNew | 7 | 20 | 1,013 |

Now: inpatient 64 (wards 01:24, 02:22, 19:7, 03:3, 04:3, 16:3, 18:2) /
180 beds = 35.6 %, home ward 68 — matches the reference screenshot exactly.
Today's ageSex sums to 419; FY ageSex sums to 15,864 (= patients). Today's
pttypes: UC 347, OFC 28, SSS 25, LGO 8, CSH 8, INS 2, GOV 1 (7 groups).
The screenshot's 400 / ER 8 were taken earlier in the day (visits still
arriving; 8 of today's 15 ER registrations were before 08:00).
