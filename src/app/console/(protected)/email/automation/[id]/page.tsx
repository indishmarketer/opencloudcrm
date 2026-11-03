import { redirect } from "next/navigation";

export default async function LegacyEmailAutomationRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/console/workflows/email/${id}`);
}
