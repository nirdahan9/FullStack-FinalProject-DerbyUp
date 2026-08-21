"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { updateProfile } from "@/lib/actions/profile";
import { Field } from "@/components/auth/field";
import { SubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";

export function EditNameForm({ current }: { current: string }) {
  const [state, formAction] = useActionState(updateProfile, null);
  const [open, setOpen] = useState(false);

  if (state?.ok && open) {
    setOpen(false);
    toast.success("השם עודכן");
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="self-start font-bold"
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-3.5 w-3.5" />
        עריכת שם
      </Button>
    );
  }

  return (
    <form action={formAction} className="card-kickoff flex flex-col gap-3" noValidate>
      <Field
        id="displayName"
        label="שם לתצוגה"
        defaultValue={current}
        maxLength={60}
        error={state && !state.ok ? state.fieldErrors?.displayName : undefined}
      />
      <p className="-mt-1 text-xs text-muted-foreground">
        השם מוצג בטבלאות הדירוג לחברי הליגות שלך.
      </p>

      {state && !state.ok && !state.fieldErrors && (
        <p role="alert" className="text-sm font-medium text-destructive">{state.error}</p>
      )}

      <div className="flex gap-2">
        <div className="flex-1">
          <SubmitButton>שמירה</SubmitButton>
        </div>
        <Button
          type="button"
          variant="outline"
          className="flex-1 font-bold"
          onClick={() => setOpen(false)}
        >
          ביטול
        </Button>
      </div>
    </form>
  );
}
