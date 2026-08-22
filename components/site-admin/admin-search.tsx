"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Search that writes to the URL, so a filtered table can be shared, bookmarked
 * and survives a refresh — the same reason pagination lives there.
 *
 * The current value arrives as a prop rather than from useSearchParams: the
 * page already read it on the server to run the query, and reading it twice
 * would only add a Suspense boundary around this input.
 */
export function AdminSearch({
  basePath,
  initial,
  placeholder,
}: {
  basePath: string;
  initial: string;
  placeholder: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);

  useEffect(() => {
    // Nothing to do while the box still holds what the page was rendered with —
    // this also stops the effect from firing on mount.
    if (value === initial) return;

    const timer = setTimeout(() => {
      const query = value.trim() ? `?q=${encodeURIComponent(value.trim())}` : "";
      router.push(`${basePath}${query}`);
    }, 350);

    return () => clearTimeout(timer);
  }, [value, initial, basePath, router]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="rounded-xl pe-9"
      />
    </div>
  );
}
