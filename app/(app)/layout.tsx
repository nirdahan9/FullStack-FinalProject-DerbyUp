import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/top-bar";
import { BottomTabBar } from "@/components/layout/bottom-tab-bar";

/**
 * Shell for every signed-in route.
 *
 * The middleware already redirects anonymous visitors, but the profile is
 * loaded here anyway and the session re-checked: this layout needs the row to
 * render the bar, and relying on the middleware alone would mean trusting a
 * redirect for data access.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, avatar_url, total_points")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <TopBar
        displayName={profile?.display_name ?? profile?.username ?? "?"}
        totalPoints={Number(profile?.total_points ?? 0)}
        avatarUrl={profile?.avatar_url ?? null}
      />

      {/* pb-safe clears the fixed tab bar plus the iOS home indicator. */}
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-safe pt-4 md:max-w-4xl md:px-8 lg:max-w-6xl">
        {children}
      </main>

      <BottomTabBar />
    </div>
  );
}
