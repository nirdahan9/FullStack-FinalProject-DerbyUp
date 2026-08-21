import { JoinLeagueForm } from "@/components/leagues/join-league-form";

export default function JoinPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="section-label">הצטרפות</span>
        <h1 className="text-3xl font-black leading-tight">קוד הזמנה</h1>
        <p className="text-sm text-muted-foreground">
          הזינו את הקוד שקיבלתם ממנהל הליגה.
        </p>
      </div>
      <JoinLeagueForm />
    </div>
  );
}
