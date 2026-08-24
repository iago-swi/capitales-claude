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
  PRIMARY KEY (run_id, position)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_runs_score ON runs (score DESC);
