import { Suspense } from "react";
import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import { getFormBySlug } from "@/lib/forms";
import { buildSafe } from "@/lib/db";

export const metadata = { title: "Sign up", robots: { index: false, follow: false } };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  const loginHref = redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login";
  const authForm = await buildSafe(() => getFormBySlug("auth"), null);

  const heading = authForm?.heading || "Create your account";
  const intro = authForm?.introText || "One account for courses and early access to products.";

  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <h1 className="font-display text-4xl font-semibold">{heading}</h1>
      {intro && <p className="mt-3 text-ink-soft">{intro}</p>}
      <Suspense>
        <AuthForm mode="signup" design={authForm?.design} />
      </Suspense>
      <p className="mt-6 text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href={loginHref} className="font-medium text-ink underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
