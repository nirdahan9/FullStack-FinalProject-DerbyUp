import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Page state lives in the URL, so a position in a long table can be shared
 * and survives a refresh.
 *
 * Chevrons are mirrored: in an RTL layout "next" points left.
 */
export function Pagination({
  page,
  hasNext,
  baseUrl,
}: {
  page: number;
  hasNext: boolean;
  baseUrl: string;
}) {
  if (page === 1 && !hasNext) return null;

  const href = (p: number) => `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}page=${p}`;

  return (
    <nav className="flex items-center justify-center gap-2" aria-label="ניווט עמודים">
      <Button variant="outline" size="sm" disabled={page <= 1} asChild={page > 1}>
        {page > 1 ? (
          <Link href={href(page - 1)}>
            <ChevronRight className="h-4 w-4" />
            הקודם
          </Link>
        ) : (
          <span>
            <ChevronRight className="h-4 w-4" />
            הקודם
          </span>
        )}
      </Button>

      <span className="text-sm text-muted-foreground">עמוד {page}</span>

      <Button variant="outline" size="sm" disabled={!hasNext} asChild={hasNext}>
        {hasNext ? (
          <Link href={href(page + 1)}>
            הבא
            <ChevronLeft className="h-4 w-4" />
          </Link>
        ) : (
          <span>
            הבא
            <ChevronLeft className="h-4 w-4" />
          </span>
        )}
      </Button>
    </nav>
  );
}
