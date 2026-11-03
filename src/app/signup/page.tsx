import { Suspense } from "react";
import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export const metadata = { title: "Sign up", robots: { index: false, follow: false } };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  const loginHref = redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login";

  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <h1 className="font-display text-4xl font-semibold">Create your account</h1>
      <p className="mt-3 text-ink-soft">
        One account for courses and early access to products.
      </p>
      <Suspense>
        <AuthForm mode="signup" />
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
