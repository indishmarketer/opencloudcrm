import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getPendingMfaEmail } from "@/lib/auth";
import { getMfaStatus, getOrCreateEnrollmentSecret } from "@/lib/consoleMfa";
import { otpauthUri } from "@/lib/totp";
import ConsoleMfaForm from "@/components/ConsoleMfaForm";
import { SITE_NAME } from "@/config/brand";

export const dynamic = "force-dynamic";

export default async function ConsoleTwoStepPage() {
  const email = await getPendingMfaEmail();
  if (!email) redirect("/console/login?error=expired");

  const status = await getMfaStatus(email);
  if (status.enabled) {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
        <h1 className="font-display text-2xl font-semibold">Enter your code</h1>
        <p className="mt-3 text-sm text-ink-soft">Open your authenticator app and enter the 6-digit code for {SITE_NAME} Console.</p>
        <ConsoleMfaForm mode="verify" />
      </div>
    );
  }

  const secret = await getOrCreateEnrollmentSecret(email);
  if (!secret) redirect("/console/login?error=expired");
  const qr = await QRCode.toDataURL(otpauthUri(secret, email), { margin: 1, width: 220 });
  const grouped = secret.match(/.{1,4}/g)?.join(" ") || secret;

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10">
      <h1 className="font-display text-2xl font-semibold">Set up 2-step login</h1>
      <p className="mt-3 text-sm text-ink-soft">
        The console now asks for a code from an authenticator app after the email link, so a hacked inbox alone can&apos;t get in.
      </p>
      <ol className="mt-6 space-y-3 text-sm">
        <li>1. Install Google Authenticator, Microsoft Authenticator or 1Password on your phone.</li>
        <li>2. In the app, add an account and scan this code.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI, not a remote image */}
      <img src={qr} alt={`QR code to add ${SITE_NAME} Console to your authenticator app`} width={220} height={220} className="mt-4 self-center rounded-xl border border-line" />
      <p className="mt-3 text-center text-xs text-ink-soft">
        Can&apos;t scan? Enter this key instead:
        <br />
        <span className="mt-1 inline-block select-all font-mono text-sm text-ink">{grouped}</span>
      </p>
      <p className="mt-6 text-sm">3. Enter the 6-digit code the app shows.</p>
      <ConsoleMfaForm mode="setup" />
    </div>
  );
}
