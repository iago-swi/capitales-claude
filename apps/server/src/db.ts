import { DatabaseSync } from 'node:sqlite';
import type { CountryRecord, Mode, RunInput, RunSummary } from '@capitales/core';
import { INDEXES, SCHEMA } from './schema.js';

interface CountryRow {
  code: string;
  name_en: string;
  name_fr: string;
  capital_en: string;
  capital_fr: string;
  capital_lon: number;
  capital_lat: number;
  continent: string;
  alt_capitals_en: string;
  alt_capitals_fr: string;
}

interface RunRow {
  id: number;
  player_name: string;
  mode: Mode;
  score: number;
  correct_count: number;
  best_streak: number;
  finished_at: string;
}

/** Opens the database and applies the schema. Pass ':memory:' in tests. */
export function openDb(file: string): DatabaseSync {
  const db = new DatabaseSync(file);

  // SQLite defaults foreign key enforcement to OFF, which would make the
  // REFERENCES clause on run_answers purely decorative. Turn it on before
  // anything is written.
  db.exec('PRAGMA foreign_keys = ON');

  // WAL lets readers and the writer work concurrently. It is meaningless for
  // an in-memory database, so skip it there.
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');

  // Order matters: tables, then any column an older database is missing, then
  // indexes — which may reference exactly those new columns.
  db.exec(SCHEMA);
  addMissingColumns(db);
  db.exec(INDEXES);
  return db;
}

/**
 * Adds columns that a database created by an older build will not have.
 *
 * `CREATE TABLE IF NOT EXISTS` does nothing to a table that already exists, so
 * a schema change is invisible to anyone with saved scores — and on the desktop
 * and Android builds those live in the user's own data directory, where
 * "delete it and re-seed" costs them their leaderboard.
 *
 * This is not a migration framework and should not grow into one: it adds a
 * column with a default and nothing else. Anything that needs data rewritten
 * deserves a real migration, or the honest instruction to start fresh.
 */
function addMissingColumns(db: DatabaseSync): void {
  const wanted: { table: string; column: string; definition: string }[] = [
    { table: 'runs', column: 'mode', definition: "TEXT NOT NULL DEFAULT 'name'" },
    { table: 'run_answers', column: 'placed_lon', definition: 'REAL' },
    { table: 'run_answers', column: 'placed_lat', definition: 'REAL' },
    { table: 'run_answers', column: 'off_km', definition: 'REAL' },
  ];

  for (const { table, column, definition } of wanted) {
    const columns = db
      .prepare(`PRAGMA table_info(${table})`)
      .all() as unknown as { name: string }[];
    if (columns.some((c) => c.name === column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/** Runs `work` in a transaction, rolling back if it throws. */
function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function toRecord(row: CountryRow): CountryRecord {
  return {
    code: row.code,
    name: { en: row.name_en, fr: row.name_fr },
    capital: { en: row.capital_en, fr: row.capital_fr },
    altCapitals: {
      en: JSON.parse(row.alt_capitals_en) as string[],
      fr: JSON.parse(row.alt_capitals_fr) as string[],
    },
    capitalLonLat: [row.capital_lon, row.capital_lat],
    continent: row.continent,
  };
}

export function countCountries(db: DatabaseSync): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM countries').get() as {
    n: number;
  };
  return row.n;
}

export function listCountries(db: DatabaseSync): CountryRecord[] {
  const rows = db
    .prepare(
      `SELECT code, name_en, name_fr, capital_en, capital_fr,
              capital_lon, capital_lat, continent,
              alt_capitals_en, alt_capitals_fr
         FROM countries
        ORDER BY code`,
    )
    .all() as unknown as CountryRow[];
  return rows.map(toRecord);
}

/** Upserts every country. Idempotent: re-seeding refreshes, never duplicates. */
export function seedCountries(
  db: DatabaseSync,
  countries: readonly CountryRecord[],
): number {
  const stmt = db.prepare(
    `INSERT INTO countries
       (code, name_en, name_fr, capital_en, capital_fr,
        capital_lon, capital_lat, continent,
        alt_capitals_en, alt_capitals_fr)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET
       name_en         = excluded.name_en,
       name_fr         = excluded.name_fr,
       capital_en      = excluded.capital_en,
       capital_fr      = excluded.capital_fr,
       capital_lon     = excluded.capital_lon,
       capital_lat     = excluded.capital_lat,
       continent       = excluded.continent,
       alt_capitals_en = excluded.alt_capitals_en,
       alt_capitals_fr = excluded.alt_capitals_fr`,
  );

  return transaction(db, () => {
    for (const c of countries) {
      stmt.run(
        c.code,
        c.name.en,
        c.name.fr,
        c.capital.en,
        c.capital.fr,
        c.capitalLonLat[0],
        c.capitalLonLat[1],
        c.continent,
        JSON.stringify(c.altCapitals.en),
        JSON.stringify(c.altCapitals.fr),
      );
    }
    return countries.length;
  });
}

/**
 * Writes one finished run and all of its answers atomically, returning the new
 * run id. A failure part-way cannot leave a run holding half its answers.
 */
export function insertRun(db: DatabaseSync, run: RunInput): number {
  const insertRunRow = db.prepare(
    `INSERT INTO runs
       (player_name, mode, score, correct_count, best_streak,
        question_count, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertAnswer = db.prepare(
    `INSERT INTO run_answers
       (run_id, position, code, chosen, correct, ms, placed_lon, placed_lat, off_km)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  return transaction(db, () => {
    const info = insertRunRow.run(
      run.playerName,
      run.mode,
      run.score,
      run.correctCount,
      run.bestStreak,
      run.questionCount,
      run.startedAt,
      new Date().toISOString(),
    );
    const id = Number(info.lastInsertRowid);

    run.answers.forEach((answer, position) => {
      const ms = Math.round(answer.ms);
      if (!Number.isFinite(ms)) {
        throw new Error(`answer ${position} has a non-finite duration`);
      }
      insertAnswer.run(
        id,
        position,
        answer.code,
        answer.chosen,
        // SQLite has no boolean type, and a STRICT table rejects one outright.
        answer.correct ? 1 : 0,
        ms,
        answer.placed?.[0] ?? null,
        answer.placed?.[1] ?? null,
        answer.offKm ?? null,
      );
    });

    return id;
  });
}

/**
 * The leaderboard for one mode.
 *
 * Naming and placing are different skills scored on different curves, so a
 * single board mixing them would rank nobody meaningfully.
 */
export function topRuns(
  db: DatabaseSync,
  limit: number,
  mode: Mode = 'name',
): RunSummary[] {
  const rows = db
    .prepare(
      `SELECT id, player_name, mode, score, correct_count, best_streak, finished_at
         FROM runs
        WHERE mode = ?
        ORDER BY score DESC, finished_at ASC
        LIMIT ?`,
    )
    .all(mode, limit) as unknown as RunRow[];

  return rows.map((r) => ({
    id: r.id,
    playerName: r.player_name,
    mode: r.mode,
    score: r.score,
    correctCount: r.correct_count,
    bestStreak: r.best_streak,
    finishedAt: r.finished_at,
  }));
}
