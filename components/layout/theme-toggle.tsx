"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/**
 * Both icons are always rendered and swapped by the `dark:` variants, so the
 * markup is identical on the server and the client. The usual alternative —
 * gating on a `mounted` state — needs a setState inside an effect, which
 * cascades a render and is what `react-hooks/set-state-in-effect` warns about.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all duration-300 dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all duration-300 dark:rotate-0 dark:scale-100" />
      <span className="sr-only">החלפת מצב תצוגה</span>
    </Button>
  );
}
