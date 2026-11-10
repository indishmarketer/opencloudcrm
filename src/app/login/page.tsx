import { Suspense } from "react";
import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import { getFormBySlug } from "@/lib/forms";
import { buildSafe } from "@/lib/db";

export const metadata = { title: "Log in", robots: { index: false, follow: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  const forwarded = redirect ? `?redirect=${encodeURIComponent(redirect)}` : "";
  const authForm = await buildSafe(() => getFormBySlug("auth"), null);

  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <h1 className="font-display text-4xl font-semibold">Log in</h1>
      <Suspense>
        <AuthForm mode="login" design={authForm?.design} />
      </Suspense>
      <p className="mt-4 text-sm text-ink-soft">
        <Link href={`/forgot-password${forwarded}`} className="font-medium text-ink underline">
          Forgot password?
        </Link>
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Don&apos;t have an account?{" "}
        <Link href={`/signup${forwarded}`} className="font-medium text-ink underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
