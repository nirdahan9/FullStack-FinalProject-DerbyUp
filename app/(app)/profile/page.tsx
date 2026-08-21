import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { ACHIEVEMENTS } from "@/lib/domain/achievements";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: earned }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, username, total_points, total_predictions, total_correct")
      .eq("id", user!.id)
      .single(),
    supabase.from("user_achievements").select("achievement_key, earned_at").eq("user_id", user!.id),
  ]);

  const earnedKeys = new Map((earned ?? []).map((a) => [a.achievement_key, a.earned_at]));
  const hitRate =
    profile?.total_predictions
      ? Math.round((profile.total_correct / profile.total_predictions) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="section-label">החשבון שלי</span>
        <h1 className="text-3xl font-black leading-tight" dir="auto">
          {profile?.display_name ?? profile?.username}
        </h1>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          {
            label: "נקודות",
            value: Number(profile?.total_points ?? 0).toLocaleString("he-IL", {
              maximumFractionDigits: 2,
            }),
          },
          { label: "ניחושים", value: String(profile?.total_predictions ?? 0) },
          { label: "אחוז פגיעה", value: `${hitRate}%` },
        ].map((stat) => (
          <div key={stat.label} className="card-kickoff flex flex-col items-center gap-1 py-4">
            <span className="text-xl font-black text-primary">{stat.value}</span>
            <span className="text-[11px] text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="section-label">🏅 הישגים</span>
          <span className="text-xs font-bold text-muted-foreground">
            {earnedKeys.size}/{ACHIEVEMENTS.length}
          </span>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(earnedKeys.size / ACHIEVEMENTS.length) * 100}%` }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {ACHIEVEMENTS.map((achievement) => {
            const isEarned = earnedKeys.has(achievement.key);
            return (
              <div
                key={achievement.key}
                className={`flex flex-col gap-1 rounded-2xl border px-3 py-3 ${
                  isEarned
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-secondary/50 opacity-60"
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  {!isEarned && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
                  {achievement.title}
                </span>
                <span className="text-[11px] leading-snug text-muted-foreground">
                  {achievement.description}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <dl className="card-kickoff flex flex-col gap-3">
        {[
          ["אימייל", user!.email ?? "—"],
          ["שם משתמש", profile?.username ?? "—"],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="truncate text-sm font-bold" dir="auto">{value}</dd>
          </div>
        ))}
      </dl>

      <SignOutButton />
    </div>
  );
}
