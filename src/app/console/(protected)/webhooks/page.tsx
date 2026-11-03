import { redirect } from "next/navigation";

export default function WebhooksPage() {
  redirect("/console/integrations?tab=outbound");
}
