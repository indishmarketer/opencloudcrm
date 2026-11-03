import AccountEmailChangeConfirmation from "@/components/AccountEmailChangeConfirmation";

export const metadata = { title: "Confirm your new email address" };
export const dynamic = "force-dynamic";

/** The GET only displays a button because inbox scanners often open links
 * automatically. The email changes only after the member confirms. */
export default async function EmailChangedPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <AccountEmailChangeConfirmation token={token || ""} />;
}
