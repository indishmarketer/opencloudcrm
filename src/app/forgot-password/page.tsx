import { Suspense } from "react";
import ForgotPasswordForm from "@/components/ForgotPasswordForm";

export const metadata = {
  title: "Reset your password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <h1 className="font-display text-4xl font-semibold">Forgot password</h1>
      <p className="mt-3 text-sm text-ink-soft">
        Enter your account email and we&apos;ll send you a link to reset your password.
      </p>
      <Suspense>
        <ForgotPasswordForm />
      </Suspense>
    </div>
  );
}
