"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-requests the current page on a timer while a match is in progress.
 *
 * The DerbyUp app pushes these updates over SSE
 * (backend/src/routes/leagues.js, GET /:id/live). That needs a connection held
 * open per viewer, which a long-running Node process on Railway can do and a
 * serverless function cannot: on Vercel every open stream is a function
 * invocation occupied for as long as someone is looking at the page.
 *
 * So the direction is reversed — the client asks instead of the server
 * telling. `router.refresh()` re-runs the Server Components for the route and
 * merges the new payload in, leaving client state and scroll position alone,
 * which is why this can sit under a table without the table jumping.
 *
 * Thirty seconds against a sync that runs every sixty means a goal is on
 * screen within a minute and a half at worst, and usually much less. Polling
 * faster would only re-render the same numbers.
 *
 * Nothing runs while the tab is hidden. A league page left open in a
 * background tab overnight would otherwise be 2,880 renders nobody reads —
 * the single cheapest thing this feature does for scale. Coming back to the
 * tab refreshes immediately rather than waiting out the interval, so the
 * score is never stale in front of someone actually looking at it.
 *
 * Renders nothing. It is a behaviour a page opts into by mounting it, and only
 * pages that know something is live do.
 */
export function LiveRefresher({ intervalSeconds = 30 }: { intervalSeconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const start = () => {
      if (timer === null) {
        timer = setInterval(() => router.refresh(), intervalSeconds * 1000);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stop();
        return;
      }
      router.refresh();
      start();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router, intervalSeconds]);

  return null;
}
