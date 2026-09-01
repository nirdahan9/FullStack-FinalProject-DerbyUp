import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the auth session on every request and keeps unauthenticated
 * visitors out of the app routes.
 *
 * This is a convenience layer, not the security boundary: a bug here would
 * change what a user sees, not what the database returns. RLS is what actually
 * protects the data.
 */
const PUBLIC_PATHS = ["/", "/login", "/signup", "/auth"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() revalidates the token with Supabase. getSession() only decodes
  // the cookie, which the client controls, so it must not be trusted here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals, static assets, and the cron routes.
    //
    // /api/cron/* must be excluded: it has no session to refresh, and this
    // proxy would redirect the unauthenticated request to /login — so the
    // scheduled job would return 307 and quietly never run.
    "/((?!api/cron|_next/static|_next/image|favicon.svg|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
