import { JoinLeagueForm } from "@/components/leagues/join-league-form";

/**
 * Shareable join link: /join/ABCD1234 pre-fills the code but still requires a
 * confirming submit, so following a link never silently enrols someone.
 */
export default async function JoinWithCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="section-label">הצטרפות</span>
        <h1 className="text-3xl font-black leading-tight">הוזמנת לליגה</h1>
        <p className="text-sm text-muted-foreground">אשרו כדי להצטרף.</p>
      </div>
      <JoinLeagueForm defaultCode={code.slice(0, 8).toUpperCase()} />
    </div>
  );
}
