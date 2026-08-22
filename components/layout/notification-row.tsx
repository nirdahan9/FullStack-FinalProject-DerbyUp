"use client";

import Link from "next/link";
import { useTransition } from "react";
import { markNotificationRead } from "@/lib/actions/notifications";

/**
 * One notification.
 *
 * Opening it marks it read — that is what "read" means, and it saves the user
 * from clearing the list by hand to get rid of a badge they have already seen.
 * `markAllRead` stays for the case where somebody wants the whole list gone
 * without opening anything.
 *
 * A notification with no link is still markable, so an achievement or a message
 * that goes nowhere does not stay unread forever.
 */
export function NotificationRow({
  id,
  href,
  isUnread,
  children,
}: {
  id: string;
  href: string | null;
  isUnread: boolean;
  children: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();

  function markRead() {
    if (!isUnread || pending) return;
    startTransition(async () => void (await markNotificationRead({ notificationId: id })));
  }

  if (href) {
    return (
      <Link href={href} onClick={markRead} className="transition-opacity hover:opacity-90">
        {children}
      </Link>
    );
  }

  // Not a link, so it needs its own affordance: a button when there is
  // something to do, a plain div once it has been read.
  if (!isUnread) return <div>{children}</div>;

  return (
    <button
      type="button"
      onClick={markRead}
      aria-label="סימון כנקרא"
      className="w-full text-start transition-opacity hover:opacity-90 disabled:opacity-60"
      disabled={pending}
    >
      {children}
    </button>
  );
}
