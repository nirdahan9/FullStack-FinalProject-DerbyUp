"use client";

import { useActionState } from "react";
import { joinLeague } from "@/lib/actions/leagues";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";

export function JoinLeagueForm({ defaultCode = "" }: { defaultCode?: string }) {
  const [state, formAction] = useActionState(joinLeague, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="card-kickoff flex flex-col gap-4" noValidate>
      <Field
        id="inviteCode"
        label="קוד הזמנה"
        placeholder="ABCD1234"
        defaultValue={defaultCode}
        maxLength={8}
        autoCapitalize="characters"
        autoComplete="off"
        // ltr and letter-spaced: an 8-character code reads left-to-right even
        // inside an RTL page.
        dir="ltr"
        className="rounded-xl text-center font-mono text-lg tracking-widest"
        error={fieldErrors?.inviteCode}
      />

      {state && !state.ok && !state.fieldErrors && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {state.error}
        </p>
      )}

      <SubmitButton>הצטרפות</SubmitButton>
    </form>
  );
}
