"use client";

import { LogOut } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/auth/submit-button";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <SubmitButton>
        <LogOut className="h-4 w-4" />
        התנתקות
      </SubmitButton>
    </form>
  );
}
