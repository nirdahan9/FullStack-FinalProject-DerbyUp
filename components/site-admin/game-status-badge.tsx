import { Badge } from "@/components/ui/badge";

const LABELS: Record<string, string> = {
  scheduled: "מתוכנן",
  live: "חי",
  finished: "הסתיים",
  postponed: "נדחה",
  cancelled: "בוטל",
};

/**
 * `settled` is not a status in the database — it is `settled_at` being set —
 * but it is the distinction an operator cares about: a finished fixture that
 * nobody has been scored for yet is the one to look at.
 */
export function GameStatusBadge({
  status,
  settledAt,
}: {
  status: string;
  settledAt: string | null;
}) {
  if (status === "finished" && !settledAt) {
    return <Badge variant="destructive">ממתין לעיבוד</Badge>;
  }
  if (status === "live") return <Badge variant="destructive">חי</Badge>;
  if (status === "finished") return <Badge variant="secondary">מעובד</Badge>;

  return <Badge variant="outline">{LABELS[status] ?? status}</Badge>;
}
