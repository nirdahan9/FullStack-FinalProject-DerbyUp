"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp } from "@/lib/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";

export default function SignUpPage() {
  const [state, formAction] = useActionState(signUp, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <AuthShell
      title="פתיחת חשבון"
      subtitle="מתחילים מאפס נקודות — וצוברים לפי היחסים"
      footer={
        <>
          כבר רשומים?{" "}
          <Link href="/login" className="font-bold text-primary hover:underline">
            התחברות
          </Link>
        </>
      }
    >
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <Field
          id="displayName"
          label="שם לתצוגה"
          autoComplete="name"
          placeholder="איך שיציג אותך בטבלה"
          error={fieldErrors?.displayName}
        />
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
          autoComplete="new-password"
          error={fieldErrors?.password}
        />
        <p className="-mt-2 text-xs text-muted-foreground">לפחות 8 תווים</p>

        {state && !state.ok && !state.fieldErrors && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
            {state.error}
          </p>
        )}

        <SubmitButton>יצירת חשבון</SubmitButton>
      </form>
    </AuthShell>
  );
}
