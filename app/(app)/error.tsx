"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Catches anything a page throws. The message is deliberately generic — a
 * database error surfaced verbatim would expose table and column names.
 * `digest` is the id Next logs on the server, so a report can be traced.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="card-kickoff flex flex-col items-center gap-3 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="font-bold">משהו השתבש</h2>
        <p className="text-sm text-muted-foreground">
          לא הצלחנו לטעון את העמוד. אפשר לנסות שוב.
        </p>
      </div>
      <Button onClick={reset} className="font-bold">נסה שוב</Button>
      {error.digest && (
        <p className="text-[11px] text-muted-foreground">קוד שגיאה: {error.digest}</p>
      )}
    </div>
  );
}
