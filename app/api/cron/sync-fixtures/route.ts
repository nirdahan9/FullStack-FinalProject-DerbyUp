import { NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { syncFixtures } from "@/lib/cron/sync-fixtures";

// Always run fresh: this route writes, so a cached response would mean a sync
// that silently never happened.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = assertCronAuth(request);
  if (denied) return denied;

  try {
    const report = await syncFixtures();
    // Partial failure is still a 200: some competitions synced, and the report
    // names the ones that did not. A 500 here would make Vercel retry work
    // that already succeeded.
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron/sync-fixtures]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// Vercel Cron issues GET; the same handler serves both.
export const GET = POST;
