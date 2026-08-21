import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/layout/sign-out-button";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, total_points, created_at")
    .eq("id", user!.id)
    .single();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="section-label">החשבון שלי</span>
        <h1 className="text-3xl font-black leading-tight">
          {profile?.display_name ?? profile?.username}
        </h1>
      </div>

      <dl className="card-kickoff flex flex-col gap-3">
        {[
          ["אימייל", user!.email ?? "—"],
          ["שם משתמש", profile?.username ?? "—"],
          [
            "נקודות",
            Number(profile?.total_points ?? 0).toLocaleString("he-IL", {
              maximumFractionDigits: 2,
            }),
          ],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="truncate text-sm font-bold" dir="auto">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <SignOutButton />
    </div>
  );
}
