import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getFormById } from "@/lib/forms";
import ConsoleFormEditor from "@/components/ConsoleFormEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit form | Console" };

export default async function ConsoleEditFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await getAdminSession())) redirect("/console/login");
  const rawId = (await params).id;
  const id = Number(rawId);
  if (isNaN(id)) notFound();

  const form = await getFormById(id);
  if (!form) notFound();

  return <ConsoleFormEditor initialForm={form} backHref="/console/forms" backLabel="All forms" />;
}
