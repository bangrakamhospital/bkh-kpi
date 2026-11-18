import { redirect } from "next/navigation";

/** /clinic has no page of its own: open the first clinic (keeps ?fy=). */
export default async function ClinicIndexPage(props: PageProps<"/clinic">) {
  const { fy } = await props.searchParams;
  const year = typeof fy === "string" && /^\d{4}$/.test(fy) ? fy : null;
  redirect(year ? `/clinic/ncd?fy=${year}` : "/clinic/ncd");
}
