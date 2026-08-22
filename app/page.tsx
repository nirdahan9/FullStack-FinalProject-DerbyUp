import { getLandingFixtures } from "@/lib/landing/fixtures";
import { LiveRefresher } from "@/components/shared/live-refresher";
import { Faq } from "@/components/landing/faq";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { ScoringModel } from "@/components/landing/scoring-model";

/**
 * The landing page — the only route an anonymous visitor sees, and the one
 * place the product has to explain itself before anyone signs up.
 *
 * The order is the order the questions arrive in: what is this (hero), what do
 * I have to do (how it works), how does the scoring work (the one rule the
 * whole thing rests on), what else is in here (features), and finally the
 * objections nobody says out loud (FAQ — "is this gambling?" first).
 *
 * Rendered on the server like every other page. The only data it fetches is
 * the fixture strip, and that call cannot fail the render: see
 * lib/landing/upcoming-games.ts.
 */
export default async function Home() {
  const games = await getLandingFixtures();
  const hasLiveGame = games.some((game) => game.status === "live");

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <LandingHeader />

      <main className="flex-1">
        <Hero games={games} />
        <HowItWorks />
        <ScoringModel />
        <FeatureGrid />
        <Faq />
        <FinalCta />
      </main>

      <LandingFooter />

      {/* Only while something is actually being played. On every other visit
          this page mounts nothing and polls nothing. */}
      {hasLiveGame && <LiveRefresher />}
    </div>
  );
}
