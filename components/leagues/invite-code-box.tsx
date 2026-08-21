"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function InviteCodeBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (insecure context, permissions).
      // The code is on screen either way, so this is not worth an error.
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">קוד הזמנה</span>
        {/* ltr + tabular-nums so the code reads left-to-right in an RTL page
            and the characters do not shift width as it is copied. */}
        <span dir="ltr" className="font-mono text-lg font-black tabular-nums tracking-widest">
          {code}
        </span>
      </div>
      <Button variant="outline" size="sm" onClick={copy} className="shrink-0 font-bold">
        {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
        {copied ? "הועתק" : "העתק"}
      </Button>
    </div>
  );
}
