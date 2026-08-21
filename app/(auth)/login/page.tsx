"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { signIn } from "@/lib/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";

function LoginForm() {
  const [state, formAction] = useActionState(signIn, null);
  const params = useSearchParams();
  const next = params.get("next") ?? "";
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />

      <Field
        id="email"
        label="אימייל"
        type="email"
        autoComplete="email"
        placeholder="you@company.com"
        dir="ltr"
        error={fieldErrors?.email}
      />
      <Field
        id="password"
        label="סיסמה"
        type="password"
        autoComplete="current-password"
        error={fieldErrors?.password}
      />

      {state && !state.ok && !state.fieldErrors && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {state.error}
        </p>
      )}

      <SubmitButton>התחברות</SubmitButton>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell
      title="ברוכים השבים"
      subtitle="התחברו כדי להמשיך לנחש"
      footer={
        <>
          אין לכם חשבון?{" "}
          <Link href="/signup" className="font-bold text-primary hover:underline">
            הרשמה
          </Link>
        </>
      }
    >
      {/* useSearchParams needs a Suspense boundary so the rest of the page can
          still be prerendered. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
