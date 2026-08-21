import { createClient } from "@/lib/supabase/server";
import { NewLeagueForm } from "@/components/leagues/new-league-form";

export default async function NewLeaguePage() {
  const supabase = await createClient();
  const { data: competitions } = await supabase
    .from("competitions")
    .select("id, name, country")
    .eq("is_active", true)
    .order("id");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="section-label">שלב 1 מתוך 1</span>
        <h1 className="text-3xl font-black leading-tight">ליגה חדשה</h1>
        <p className="text-sm text-muted-foreground">
          בוחרים טורניר, וחברי הליגה ינחשו את משחקיו.
        </p>
      </div>

      <NewLeagueForm competitions={competitions ?? []} />
    </div>
  );
}
