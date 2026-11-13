import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getPopup } from "@/lib/popups";
import ConsolePopupEditor from "@/components/ConsolePopupEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit popup | Console" };

export default async function ConsolePopupEditorPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) redirect("/console/login");
  const popup = await getPopup(Number((await params).id));
  if (!popup) notFound();
  return <ConsolePopupEditor popup={popup} />;
}
