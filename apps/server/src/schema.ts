/**
 * The database schema.
 *
 * Held as a string rather than read from a .sql file at runtime: the Electron
 * main process is bundled to CommonJS, where `import.meta.url` is empty, so
 * resolving a sibling file breaks in the packaged app. Inlining it means the
 * schema travels with the code in every build, dev and packaged alike.
 *
 * Every statement is IF NOT EXISTS, so this is applied on every open and there
 * is no migration tooling.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS countries (
  code             TEXT PRIMARY KEY,
  name_en          TEXT NOT NULL,
  name_fr          TEXT NOT NULL,
  capital_en       TEXT NOT NULL,
  capital_fr       TEXT NOT NULL,
  capital_lon      REAL NOT NULL,
  capital_lat      REAL NOT NULL,
  continent        TEXT NOT NULL,
  alt_capitals_en  TEXT NOT NULL DEFAULT '[]',
  alt_capitals_fr  TEXT NOT NULL DEFAULT '[]'
) STRICT;

CREATE TABLE IF NOT EXISTS runs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name    TEXT NOT NULL,
  mode           TEXT NOT NULL DEFAULT 'name',
  score          INTEGER NOT NULL,
  correct_count  INTEGER NOT NULL,
  best_streak    INTEGER NOT NULL,
  question_count INTEGER NOT NULL,
  started_at     TEXT NOT NULL,
  finished_at    TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS run_answers (
  run_id    INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  code      TEXT NOT NULL,
  chosen    TEXT,
  correct   INTEGER NOT NULL,
  ms        INTEGER NOT NULL,
  placed_lon REAL,
  placed_lat REAL,
  off_km     REAL,
  PRIMARY KEY (run_id, position)
) STRICT;

`;

/**
 * Indexes, applied separately and *after* any missing columns are added.
 *
 * They have to be: an index over `mode` cannot be created on a table that
 * predates that column, and CREATE TABLE IF NOT EXISTS does nothing to an
 * existing table. Running these with the tables threw "SQL logic error" on
 * every database created by an earlier build.
 */
export const INDEXES = `
-- The leaderboard is always asked for one mode at a time, so the index leads
-- with it; a bare score index would scan the other mode's rows for nothing.
CREATE INDEX IF NOT EXISTS idx_runs_mode_score ON runs (mode, score DESC);
`;

