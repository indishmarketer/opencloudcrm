import { redirect } from "next/navigation";

export default async function AutomationPage() {
  redirect("/console/workflows");
}
