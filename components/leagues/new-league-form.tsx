"use client";

import { useActionState } from "react";
import { createLeague } from "@/lib/actions/leagues";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";
import { Label } from "@/components/ui/label";

type Competition = { id: number; name: string; country: string };

export function NewLeagueForm({ competitions }: { competitions: Competition[] }) {
  const [state, formAction] = useActionState(createLeague, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="card-kickoff flex flex-col gap-4" noValidate>
      <Field
        id="name"
        label="שם הליגה"
        placeholder="ליגת המשרד"
        maxLength={60}
        error={fieldErrors?.name}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="competitionId" className="text-sm font-bold">
          טורניר
        </Label>
        {/* A native select rather than a styled listbox: it is one of the few
            controls a mobile browser renders better than we can, and this form
            is mostly used on a phone. */}
        <select
          id="competitionId"
          name="competitionId"
          required
          defaultValue=""
          className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
          aria-describedby={fieldErrors?.competitionId ? "competitionId-error" : undefined}
        >
          <option value="" disabled>
            בחרו טורניר
          </option>
          {competitions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {c.country}
            </option>
          ))}
        </select>
        {fieldErrors?.competitionId && (
          <p id="competitionId-error" role="alert" className="text-xs font-medium text-destructive">
            {fieldErrors.competitionId}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          לא ניתן לשנות את הטורניר אחרי היצירה.
        </p>
      </div>

      <Field
        id="description"
        label="תיאור (אופציונלי)"
        placeholder="למי הליגה מיועדת"
        maxLength={500}
        error={fieldErrors?.description}
      />

      {state && !state.ok && !state.fieldErrors && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {state.error}
        </p>
      )}

      <SubmitButton>יצירת ליגה</SubmitButton>
    </form>
  );
}
