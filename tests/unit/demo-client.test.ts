import { describe, expect, it } from "vitest";
import { createClient, createAdminClient } from "@/lib/demo/client";
import { COMPETITIONS, DEMO_USER_ID, LEAGUES, GAME_ID, GAMES, PREDICTIONS } from "@/lib/demo/fixtures";
import { DEMO_NOW } from "@/lib/demo/now";
import { rankRows } from "@/lib/domain/standings";
import { sumLiveByUser, type LiveRow } from "@/lib/domain/live-projection";
import type { QuestionType } from "@/lib/domain/types";

const NOW = DEMO_NOW.toISOString();

describe("demo client", () => {
  it("auth returns the demo user", async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    expect(user?.id).toBe(DEMO_USER_ID);
    expect(user?.email).toContain("@");
  });

  it("app layout: profile single + unread head count", async () => {
    const supabase = await createClient();
    const [{ data: profile }, { count }] = await Promise.all([
      supabase.from("profiles")
        .select("display_name, username, avatar_url, total_points, is_site_admin")
        .eq("id", DEMO_USER_ID).single(),
      supabase.from("notifications").select("*", { count: "exact", head: true })
        .eq("user_id", DEMO_USER_ID).is("read_at", null),
    ]);
    expect(profile?.username).toBeTruthy();
    expect(Object.keys(profile!)).toEqual(
      ["display_name", "username", "avatar_url", "total_points", "is_site_admin"],
    );
    expect(count).toBeGreaterThan(0);
  });

  it("dashboard: nested two-level embed through league_members", async () => {
    const supabase = await createClient();
    const { data: memberships } = await supabase.from("league_members")
      .select("leagues(id, name, competition_id, featured_game_id, competitions(name))")
      .eq("user_id", DEMO_USER_ID);
    const leagues = (memberships ?? []).flatMap((m) => (m.leagues ? [m.leagues] : []));
    expect(leagues.length).toBe(2);
    expect(leagues[0].competitions?.name).toBeTruthy();
  });

  it("dashboard: upcoming games with in/eq/gt/order/limit", async () => {
    const supabase = await createClient();
    const { data } = await supabase.from("games")
      .select("id, home_team, kickoff_at, competitions(name)")
      .in("competition_id", [39, 2])
      .eq("status", "scheduled")
      .gt("kickoff_at", NOW)
      .order("kickoff_at", { ascending: true })
      .limit(5);
    expect(data).toHaveLength(5);
    expect(data![0].competitions?.name).toBeTruthy();
    const times = data!.map((g) => g.kickoff_at);
    expect([...times].sort()).toEqual(times);
  });

  it("predictions page: three-level embed + inclusive range", async () => {
    const supabase = await createClient();
    const { data } = await supabase.from("predictions")
      .select("id, odds, status, exact_score, questions(type, games(home_team, away_team, score_home, score_away))")
      .eq("user_id", DEMO_USER_ID)
      .order("predicted_at", { ascending: false })
      .range(0, 20);
    expect(data).toHaveLength(21);
    expect(data![0].questions?.games?.home_team).toBeTruthy();
  });

  it("game page: maybeSingle hit and miss, to-many embed", async () => {
    const supabase = await createClient();
    const id = GAME_ID["pl-mci-liv"];
    const { data: game, error } = await supabase.from("games")
      .select("id, home_team, competitions(name)").eq("id", id).maybeSingle();
    expect(error).toBeNull();
    expect(game?.id).toBe(id);

    const miss = await supabase.from("games").select("id")
      .eq("id", "00000000-0000-4000-8000-000000000000").maybeSingle();
    expect(miss.data).toBeNull();
    expect(miss.error).toBeNull();

    const { data: questions } = await supabase.from("questions")
      .select("id, type, outcomes, correct_outcome, odds_provisional")
      .eq("game_id", id).order("type");
    expect(questions).toHaveLength(3);

    const { data: withKids } = await supabase.from("games")
      .select("id, questions(type, outcomes)").eq("id", id).maybeSingle();
    expect(withKids?.questions).toHaveLength(3);
  });

  it("single() errors with PGRST116 on zero and many rows", async () => {
    const supabase = await createClient();
    const none = await supabase.from("profiles").select("id")
      .eq("id", "00000000-0000-4000-8000-000000000000").single();
    expect(none.data).toBeNull();
    expect(none.error?.code).toBe("PGRST116");
    expect(none.error?.details).toBe("The result contains 0 rows");

    const many = await supabase.from("profiles").select("id").single();
    expect(many.error?.code).toBe("PGRST116");
  });

  it("challenge: play_date filter and the answers stay unselected", async () => {
    const supabase = await createClient();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" })
      .format(DEMO_NOW);
    const { data: puzzle } = await supabase.from("daily_puzzles")
      .select("id, club_a, club_b, play_date").eq("play_date", today).maybeSingle();
    expect(puzzle?.club_a).toBeTruthy();
    expect("valid_answers" in puzzle!).toBe(false);

    const { data: attempts } = await supabase.from("puzzle_attempts")
      .select("answer, is_correct, attempt_number")
      .eq("user_id", DEMO_USER_ID).eq("puzzle_id", puzzle!.id)
      .order("attempt_number", { ascending: true });
    expect(Array.isArray(attempts)).toBe(true);
  });

  it("challenge: ilike autocomplete", async () => {
    const supabase = await createClient();
    const { data } = await supabase.from("bridge_players")
      .select("name").ilike("normalized_name", "%alon%").limit(10);
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it("league admin: is(null) + lt + descending order", async () => {
    const supabase = await createClient();
    const { data } = await supabase.from("games")
      .select("id, home_team, kickoff_at")
      .eq("competition_id", 2)
      .is("settled_at", null)
      .lt("kickoff_at", NOW)
      .order("kickoff_at", { ascending: false })
      .limit(20);
    expect(Array.isArray(data)).toBe(true);
  });

  it("advisor: or() with quoted values, and or(and(..),and(..))", async () => {
    const supabase = await createClient();
    const team = GAMES[0].home_team;
    const { data: form } = await supabase.from("games")
      .select("home_team, away_team, score_home, score_away, kickoff_at")
      .eq("status", "finished")
      .or(`home_team.eq."${team}",away_team.eq."${team}"`)
      .order("kickoff_at", { ascending: false }).limit(5);
    expect((form ?? []).length).toBeGreaterThan(0);
    expect(form!.every((r) => r.home_team === team || r.away_team === team)).toBe(true);

    const h2h = await supabase.from("games")
      .select("home_team, away_team")
      .eq("status", "finished")
      .or(`and(home_team.eq."${team}",away_team.eq."nope"),and(home_team.eq."nope",away_team.eq."${team}")`);
    expect(h2h.data).toHaveLength(0);
  });

  it("advisor: count: exact without head, plus gte", async () => {
    const supabase = await createClient();
    const { data, count } = await supabase.from("games")
      .select("id, competitions(name, logo_url)", { count: "exact" })
      .eq("status", "scheduled")
      .gte("kickoff_at", NOW)
      .order("kickoff_at", { ascending: true })
      .limit(2);
    expect(data).toHaveLength(2);
    expect(count).toBeGreaterThan(2);
  });

  it("writes report success and mutate nothing", async () => {
    const supabase = await createClient();
    const before = PREDICTIONS.length;

    const { data: created, error } = await supabase.from("predictions").insert({
      user_id: DEMO_USER_ID,
      question_id: "30000000-0000-4000-8000-000000000001",
      selected_outcome: "home",
      odds: 1.8,
      bonus_pct: 0,
      odds_provisional: false,
      exact_score: null,
    }).select("id").single();

    expect(error).toBeNull();
    expect(created!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(PREDICTIONS.length).toBe(before);

    const update = await supabase.from("leagues")
      .update({ status: "archived" }).eq("id", LEAGUES[1].id);
    expect(update.error).toBeNull();
    expect(LEAGUES[1].status).toBe("active");

    const del = await supabase.from("league_members").delete()
      .eq("league_id", LEAGUES[0].id).eq("user_id", DEMO_USER_ID);
    expect(del.error).toBeNull();

    const up = await supabase.from("games")
      .upsert(
        [
          {
            fixture_id: 1,
            competition_id: COMPETITIONS[0].id,
            home_team: "A",
            away_team: "B",
            kickoff_at: DEMO_NOW.toISOString(),
          },
        ],
        { onConflict: "fixture_id" },
      );
    expect(up.error).toBeNull();

    const conversation = await supabase.from("advisor_conversations")
      .insert({ user_id: DEMO_USER_ID, game_id: GAME_ID["pl-mci-liv"] })
      .select("id").maybeSingle();
    expect(conversation.data?.id).toBeTruthy();
  });

  it("insert ids are deterministic", async () => {
    const supabase = await createClient();
    const once = await supabase.from("advisor_messages")
      .insert({ conversation_id: "c", role: "user", content: "hi", blocked: false })
      .select("id").single();
    const twice = await supabase.from("advisor_messages")
      .insert({ conversation_id: "c", role: "user", content: "hi", blocked: false })
      .select("id").single();
    expect(once.data!.id).toBe(twice.data!.id);
  });

  it("league_standings ranks through rankRows", async () => {
    const supabase = await createClient();
    const { data } = await supabase.rpc("league_standings", {
      p_league_id: LEAGUES[0].id, p_limit: 100, p_offset: 0,
    });
    expect((data ?? []).length).toBe(12);
    const points = data!.map((r) => Number(r.points));
    expect([...points].sort((a, b) => b - a)).toEqual(points);
    expect(data![0].display_name).toBeTruthy();
    const ranked = rankRows(data!.map((r) => ({
      userId: r.user_id, displayName: r.display_name, points: Number(r.points),
      correctCount: Number(r.correct_count), joinedAt: new Date(r.joined_at),
    })));
    expect(ranked[0].rank).toBe(1);
  });

  it("league_live_predictions feeds the real projection", async () => {
    const supabase = await createClient();
    const champions = LEAGUES.find((l) => l.creator_id === DEMO_USER_ID)!;
    for (const league of [LEAGUES[0], champions]) {
      const { data } = await supabase.rpc("league_live_predictions", {
        p_league_id: league.id,
      });
      const rows: LiveRow[] = (data ?? []).map((r) => ({
        userId: r.user_id,
        questionType: r.question_type as QuestionType,
        selectedOutcome: r.selected_outcome,
        odds: Number(r.odds),
        currentOdds: r.current_odds === null ? null : Number(r.current_odds),
        oddsProvisional: r.odds_provisional,
        bonusPct: Number(r.bonus_pct),
        exactScore: r.exact_score,
        scoreHome: Number(r.score_home),
        scoreAway: Number(r.score_away),
      }));
      expect(() => sumLiveByUser(rows)).not.toThrow();
    }
  });

  it("get_global_leaderboard pages and orders", async () => {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_global_leaderboard", { p_limit: 21, p_offset: 0 });
    expect(data).toHaveLength(12);
    const points = data!.map((r) => Number(r.total_points));
    expect([...points].sort((a, b) => b - a)).toEqual(points);

    const page2 = await supabase.rpc("get_global_leaderboard", { p_limit: 5, p_offset: 10 });
    expect(page2.data).toHaveLength(2);
  });

  it("admin_overview returns one row of counters", async () => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_overview");
    expect(error).toBeNull();
    const stats = data?.[0];
    expect(stats!.users_total).toBe(12);
    expect(stats!.games_total).toBe(GAMES.length);
    expect(stats!.predictions_total).toBe(PREDICTIONS.length);
    expect(stats!.games_live).toBe(2);
    expect(stats!.points_awarded).toBeGreaterThan(0);
    expect(stats!.puzzle_attempts_today).toBeGreaterThanOrEqual(0);
  });

  it("admin lists page, search and sort", async () => {
    const supabase = await createClient();
    const users = await supabase.rpc("admin_list_users", { p_limit: 26, p_offset: 0 });
    expect(users.data).toHaveLength(12);
    expect(users.data![0].email).toContain("@derbyup.example");

    const searched = await supabase.rpc("admin_list_users", { p_search: "noam", p_limit: 26 });
    expect(searched.data).toHaveLength(1);

    const admins = await supabase.rpc("admin_list_site_admins");
    expect(admins.data).toHaveLength(1);
    expect(admins.data![0].id).toBe(DEMO_USER_ID);

    const leagues = await supabase.rpc("admin_list_leagues", { p_limit: 26, p_offset: 0 });
    expect(leagues.data).toHaveLength(3);
    expect(leagues.data![0].member_count).toBeGreaterThan(0);
    expect(leagues.data![0].competition_name).toBeTruthy();

    const unsettled = await supabase.rpc("admin_list_games", {
      p_status: "unsettled", p_limit: 26, p_offset: 0,
    });
    expect(Array.isArray(unsettled.data)).toBe(true);

    const upcoming = await supabase.rpc("admin_list_games", { p_status: "upcoming", p_limit: 5 });
    expect(upcoming.data).toHaveLength(5);

    const detail = await supabase.rpc("admin_user_detail", { p_user_id: DEMO_USER_ID });
    expect(detail.data![0].is_site_admin).toBe(true);

    const mine = await supabase.rpc("admin_user_leagues", { p_user_id: DEMO_USER_ID });
    expect(mine.data).toHaveLength(2);
    expect(mine.data!.some((l) => l.is_creator)).toBe(true);

    const preds = await supabase.rpc("admin_user_predictions", {
      p_user_id: DEMO_USER_ID, p_limit: 50,
    });
    expect(preds.data!.length).toBeGreaterThan(0);
    expect(preds.data![0].home_team).toBeTruthy();
  });

  it("landing_fixtures puts a live match first and caps at three", async () => {
    const supabase = await createClient();
    const { data } = await supabase.rpc("landing_fixtures");
    expect(data).toHaveLength(3);
    expect(data![0].status).toBe("live");
    expect(Array.isArray(data![0].outcomes)).toBe(true);
  });

  it("landing_advisor_card returns today's pick", async () => {
    const supabase = await createClient();
    const { data } = await supabase.rpc("landing_advisor_card");
    expect(data).toHaveLength(1);
    expect(data![0].payload).toBeTruthy();
    expect(data![0].competition_name).toBeTruthy();
  });

  it("advisor quota is reported but never spent", async () => {
    const supabase = await createClient();
    const remaining = await supabase.rpc("advisor_quota_remaining", { p_limit: 10 });
    expect(remaining.data).toBe(4);
    const first = await supabase.rpc("advisor_consume_quota", { p_limit: 10 });
    const second = await supabase.rpc("advisor_consume_quota", { p_limit: 10 });
    expect(first.data).toBe(3);
    expect(second.data).toBe(3);
    const spent = await supabase.rpc("advisor_consume_quota", { p_limit: 6 });
    expect(spent.data).toBe(-1);
  });

  it("advisor_crowd_split groups deterministically", async () => {
    const supabase = await createClient();
    const { data } = await supabase.rpc("advisor_crowd_split", {
      p_game_id: GAME_ID["pl-mci-liv"],
    });
    expect((data ?? []).length).toBeGreaterThan(0);
    expect(data!.reduce((n, r) => n + Number(r.picks), 0)).toBeGreaterThan(0);
    const again = await supabase.rpc("advisor_crowd_split", {
      p_game_id: GAME_ID["pl-mci-liv"],
    });
    expect(again.data).toEqual(data);
  });

  it("is_site_admin, api_cache and best_league_rank", async () => {
    const supabase = await createClient();
    expect((await supabase.rpc("is_site_admin")).data).toBe(true);
    expect((await supabase.rpc("api_cache_get", { p_key: "/fixtures", p_max_age_seconds: 60 })).data).toBeNull();
    expect((await supabase.rpc("api_cache_put", { p_key: "/fixtures", p_payload: {} })).error).toBeNull();
    const rank = await supabase.rpc("best_league_rank", { p_user: DEMO_USER_ID });
    expect(typeof rank.data).toBe("number");
    expect(rank.data).toBeGreaterThanOrEqual(1);
  });

  it("join_league resolves, refuses and never joins", async () => {
    const supabase = await createClient();
    const joinable = LEAGUES.find((l) => l.creator_id !== DEMO_USER_ID && l.competition_id === 140)!;

    const good = await supabase.rpc("join_league", { p_invite_code: joinable.invite_code.toLowerCase() });
    expect(good.data).toBe(joinable.id);
    expect(good.error).toBeNull();

    const bad = await supabase.rpc("join_league", { p_invite_code: "ZZZZZZZZ" });
    expect(bad.error?.message).toContain("INVALID_CODE");

    const member = await supabase.rpc("join_league", { p_invite_code: LEAGUES[0].invite_code });
    expect(member.error?.message).toContain("ALREADY_MEMBER");
  });

  it("create_league validates and lands on a real league", async () => {
    const supabase = await createClient();
    const own = LEAGUES.find((l) => l.creator_id === DEMO_USER_ID)!;

    const made = await supabase.rpc("create_league", { p_name: "ליגה חדשה", p_competition_id: 39 });
    expect(made.data![0].league_id).toBe(own.id);
    expect(made.data![0].league_code).toBe(own.invite_code);

    const short = await supabase.rpc("create_league", { p_name: "אב", p_competition_id: 39 });
    expect(short.error?.message).toContain("INVALID_NAME");

    const nope = await supabase.rpc("create_league", { p_name: "ליגה", p_competition_id: 999 });
    expect(nope.error?.message).toContain("INVALID_COMPETITION");
  });

  it("cancel_prediction runs the real window rule", async () => {
    const supabase = await createClient();
    const other = PREDICTIONS.find((p) => p.user_id !== DEMO_USER_ID)!;
    expect((await supabase.rpc("cancel_prediction", { p_id: other.id })).error?.message)
      .toBe("NOT_OWNER");

    const settled = PREDICTIONS.find(
      (p) => p.user_id === DEMO_USER_ID && p.status === "correct",
    )!;
    expect((await supabase.rpc("cancel_prediction", { p_id: settled.id })).error?.message)
      .toBe("ALREADY_SETTLED");

    const missing = await supabase.rpc("cancel_prediction", {
      p_id: "00000000-0000-4000-8000-000000000000",
    });
    expect(missing.error?.message).toBe("NOT_FOUND");

    // A pending prediction on a fixture more than ten minutes out cancels; one
    // on the live match is inside the window and is refused.
    const pending = PREDICTIONS.filter((p) => p.user_id === DEMO_USER_ID && p.status === "pending");
    const outcomes = new Set<string | undefined>();
    for (const prediction of pending) {
      const result = await supabase.rpc("cancel_prediction", { p_id: prediction.id });
      outcomes.add(result.error?.message);
    }
    expect(outcomes.has(undefined)).toBe(true);
    expect(outcomes.has("CANCEL_WINDOW_CLOSED")).toBe(true);
  });

  it("settlement RPCs validate and write nothing", async () => {
    const supabase = await createClient();
    const finished = GAMES.find((g) => g.status === "finished" && g.settled_at !== null)!;
    const already = await supabase.rpc("admin_settle_game", {
      p_game_id: finished.id, p_score_home: 1, p_score_away: 0,
    });
    expect(already.error?.message).toBe("ALREADY_SETTLED");

    const future = GAMES.find((g) => g.status === "scheduled")!;
    const early = await supabase.rpc("admin_settle_game", {
      p_game_id: future.id, p_score_home: 1, p_score_away: 0,
    });
    expect(early.error?.message).toBe("GAME_NOT_STARTED");

    const live = GAMES.find((g) => g.status === "live")!;
    const bad = await supabase.rpc("admin_settle_game", {
      p_game_id: live.id, p_score_home: 120, p_score_away: 0,
    });
    expect(bad.error?.message).toBe("INVALID_SCORE");

    const good = await supabase.rpc("admin_settle_game", {
      p_game_id: live.id, p_score_home: 2, p_score_away: 1,
    });
    expect(good.error).toBeNull();
    expect(live.score_home).not.toBe(2);

    const champions = LEAGUES.find((l) => l.creator_id === DEMO_USER_ID)!;
    const wrongLeague = await supabase.rpc("settle_game_manually", {
      p_league_id: LEAGUES[0].id, p_game_id: live.id, p_score_home: 1, p_score_away: 1,
    });
    expect(wrongLeague.error?.message).toBe("NOT_LEAGUE_ADMIN");
    expect(champions.id).toBeTruthy();
  });

  it("admin guards on self", async () => {
    const supabase = await createClient();
    const self = await supabase.rpc("admin_set_site_admin", {
      p_user_id: DEMO_USER_ID, p_value: false,
    });
    expect(self.error?.message).toBe("CANNOT_CHANGE_SELF");

    const other = PREDICTIONS.find((p) => p.user_id !== DEMO_USER_ID)!.user_id;
    const ok = await supabase.rpc("admin_set_site_admin", { p_user_id: other, p_value: true });
    expect(ok.error).toBeNull();

    const deleteSelf = await supabase.rpc("admin_delete_user", { p_user_id: DEMO_USER_ID });
    expect(deleteSelf.error?.message).toBe("CANNOT_DELETE_SELF");

    const deleteOther = await supabase.rpc("admin_delete_user", { p_user_id: other });
    expect(deleteOther.error).toBeNull();
  });

  it("an unknown function reports PGRST202", async () => {
    const supabase = await createClient();
    // @ts-expect-error — the point of the test is a name the types reject.
    const { error } = await supabase.rpc("no_such_function");
    expect(error?.code).toBe("PGRST202");
  });

  it("the admin client is the same read-only object", async () => {
    const admin = createAdminClient();
    const { data } = await admin.from("user_achievements")
      .select("achievement_key").eq("user_id", DEMO_USER_ID);
    expect((data ?? []).length).toBeGreaterThan(0);

    const { data: ach } = await admin.from("league_members")
      .select("league_id, leagues(is_public)").eq("user_id", DEMO_USER_ID);
    expect(ach!.every((m) => m.leagues?.is_public === false)).toBe(true);
  });

  it("two identical renders produce identical output", async () => {
    const a = await createClient();
    const b = await createClient();
    const one = await a.rpc("league_standings", { p_league_id: LEAGUES[0].id, p_limit: 100, p_offset: 0 });
    const two = await b.rpc("league_standings", { p_league_id: LEAGUES[0].id, p_limit: 100, p_offset: 0 });
    expect(one.data).toEqual(two.data);
  });
});
