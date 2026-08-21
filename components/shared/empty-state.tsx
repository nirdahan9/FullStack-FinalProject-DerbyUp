import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** An empty list should say what to do next, not just that it is empty. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  secondaryAction,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: { href: string; label: string };
  secondaryAction?: { href: string; label: string };
}) {
  return (
    <div className="card-kickoff flex flex-col items-center gap-3 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="font-bold text-foreground">{title}</h2>
        <p className="max-w-xs text-sm text-muted-foreground">{body}</p>
      </div>
      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {action && (
            <Button asChild className="font-bold">
              <Link href={action.href}>{action.label}</Link>
            </Button>
          )}
          {secondaryAction && (
            <Button asChild variant="outline" className="font-bold">
              <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
