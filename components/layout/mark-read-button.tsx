"use client";

import { useTransition } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { markAllRead } from "@/lib/actions/notifications";
import { Button } from "@/components/ui/button";

export function MarkReadButton({ disabled }: { disabled: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      className="font-bold"
      disabled={disabled || pending}
      onClick={() => startTransition(async () => void (await markAllRead()))}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
      סמן הכל כנקרא
    </Button>
  );
}
