import { NextResponse } from "next/server";

/**
 * Guards the cron routes.
 *
 * These handlers run under the service role and bypass RLS entirely, which
 * makes them the most dangerous endpoints in the system — an unauthenticated
 * caller reaching /api/cron/settle could settle matches at will. Vercel Cron
 * sends the secret as a bearer token.
 */
export function assertCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }

  const header = request.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
