import { NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { settleFinishedGames } from "@/lib/cron/settle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = assertCronAuth(request);
  if (denied) return denied;

  try {
    const report = await settleFinishedGames();
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron/settle]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = POST;
