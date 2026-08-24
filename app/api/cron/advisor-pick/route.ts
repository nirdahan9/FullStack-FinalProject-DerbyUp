import { NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { refreshDailyPicks } from "@/lib/cron/advisor-pick";

export const dynamic = "force-dynamic";
// Seven analyses, run one after another so the provider's per-minute limit is
// never the thing that decides how many succeed.
export const maxDuration = 300;

export async function POST(request: Request) {
  const denied = assertCronAuth(request);
  if (denied) return denied;

  try {
    const report = await refreshDailyPicks();
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron/advisor-pick]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = POST;
