import { NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { syncLiveScores } from "@/lib/cron/sync-live";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = assertCronAuth(request);
  if (denied) return denied;

  try {
    const report = await syncLiveScores();
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron/sync-live]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = POST;
