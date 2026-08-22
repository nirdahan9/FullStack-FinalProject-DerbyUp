/**
 * Club crests for the Football Bridge board.
 *
 * The same football-data.org crest IDs the DerbyUp minigame uses
 * (`FootballBridgeGame.tsx`), keyed here by the Hebrew club name because that
 * is what `daily_puzzles.club_a` / `club_b` hold. A public CDN, no key needed.
 *
 * The twenty entries are exactly the pool `scripts/build-puzzle-bank.mjs` draws
 * puzzles from, so every puzzle resolves to two crests. A club that ever falls
 * outside the map still renders — the board falls back to a shield icon.
 */
const CREST_ID: Record<string, string> = {
  "מנצ׳סטר יונייטד": "66",
  "מנצ׳סטר סיטי": "65",
  ליברפול: "64",
  "צ׳לסי": "61",
  ארסנל: "57",
  טוטנהאם: "73",
  "ריאל מדריד": "86",
  ברצלונה: "81",
  "אתלטיקו מדריד": "78",
  סביליה: "559",
  "באיירן מינכן": "5",
  "בורוסיה דורטמונד": "4",
  "באייר לברקוזן": "3",
  יובנטוס: "109",
  מילאן: "98",
  אינטר: "108",
  נאפולי: "113",
  רומא: "100",
  "פ.ס.ז׳": "524",
  מארסיי: "516",
};

export function crestUrl(club: string): string | null {
  const id = CREST_ID[club];
  return id ? `https://crests.football-data.org/${id}.png` : null;
}
