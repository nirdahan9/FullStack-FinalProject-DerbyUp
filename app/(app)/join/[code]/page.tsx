import { JoinLeagueForm } from "@/components/leagues/join-league-form";
import { LEAGUES } from "@/lib/demo/fixtures";

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

/**
 * Under `output: "export"` every dynamic route has to name its pages at build
 * time. There is no database to ask, so the list is one page per invite code - the same frozen
 * snapshot the page itself reads.
 */
export function generateStaticParams() {
  return LEAGUES.map((league) => ({ code: league.invite_code }));
}
