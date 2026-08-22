/**
 * Display helpers for the admin screens, where the same date and the same
 * number shape are repeated across four tables.
 *
 * Everything is rendered in Asia/Jerusalem. The server runs in UTC, so without
 * the zone a fixture at 21:00 would be shown as 18:00 to the operator checking
 * whether it kicked off.
 */
const TZ = "Asia/Jerusalem";

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("he-IL", {
    day: "numeric",
    month: "numeric",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  });
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "numeric",
    year: "2-digit",
    timeZone: TZ,
  });
}

export function formatNumber(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString("he-IL", { maximumFractionDigits: 0 });
}

export function formatPoints(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
