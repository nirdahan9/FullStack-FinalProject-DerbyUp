import type { LucideIcon } from "lucide-react";

/**
 * One KPI. `tone` is for the counters an operator is meant to act on rather
 * than read — an unsettled queue that is not zero is a problem, not a number.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "alert";
}) {
  return (
    <div className="card-kickoff flex flex-col gap-1 p-4">
      <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span
        className={`text-2xl font-black leading-none ${
          tone === "alert" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}
