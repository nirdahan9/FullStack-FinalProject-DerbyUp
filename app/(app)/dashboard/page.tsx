import { createClient } from "@/lib/supabase/server";

/**
 * Placeholder for stage 2. The real dashboard — upcoming fixtures, your
 * leagues, the daily challenge — is built once those features exist.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, total_points, total_predictions, total_correct")
    .eq("id", user!.id)
    .single();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="section-label">שלום</span>
        <h1 className="text-3xl font-black leading-tight">
          {profile?.display_name ?? profile?.username}
        </h1>
        <p className="text-sm text-muted-foreground">המשחק מתחיל כאן.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "נקודות", value: Number(profile?.total_points ?? 0) },
          { label: "ניחושים", value: profile?.total_predictions ?? 0 },
          { label: "פגיעות", value: profile?.total_correct ?? 0 },
        ].map((stat) => (
          <div key={stat.label} className="card-kickoff flex flex-col items-center gap-1 py-4">
            <span className="text-2xl font-black text-primary">
              {stat.value.toLocaleString("he-IL", { maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </div>

      <div className="card-kickoff">
        <p className="text-sm text-muted-foreground">
          המשחקים, הליגות והאתגר היומי נוספים בשלבים הבאים.
        </p>
      </div>
    </div>
  );
}
