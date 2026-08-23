import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Country, RunInput, RunSummary } from '@capitales/core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(HERE, 'schema.sql');

interface CountryRow {
  code: string;
  name: string;
  capital: string;
  capital_lon: number;
  capital_lat: number;
  centroid_lon: number;
  centroid_lat: number;
  continent: string;
  alt_capitals: string;
}

interface RunRow {
  id: number;
  player_name: string;
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

  db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
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

function toCountry(row: CountryRow): Country {
  return {
    code: row.code,
    name: row.name,
    capital: row.capital,
    capitalLonLat: [row.capital_lon, row.capital_lat],
    centroid: [row.centroid_lon, row.centroid_lat],
    continent: row.continent,
    altCapitals: JSON.parse(row.alt_capitals) as string[],
  };
}

export function countCountries(db: DatabaseSync): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM countries').get() as {
    n: number;
  };
  return row.n;
}

export function listCountries(db: DatabaseSync): Country[] {
  const rows = db
    .prepare(
      `SELECT code, name, capital, capital_lon, capital_lat,
              centroid_lon, centroid_lat, continent, alt_capitals
         FROM countries
        ORDER BY code`,
    )
    .all() as unknown as CountryRow[];
  return rows.map(toCountry);
}

/** Upserts every country. Idempotent: re-seeding refreshes, never duplicates. */
export function seedCountries(
  db: DatabaseSync,
  countries: readonly Country[],
): number {
  const stmt = db.prepare(
    `INSERT INTO countries
       (code, name, capital, capital_lon, capital_lat,
        centroid_lon, centroid_lat, continent, alt_capitals)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET
       name         = excluded.name,
       capital      = excluded.capital,
       capital_lon  = excluded.capital_lon,
       capital_lat  = excluded.capital_lat,
       centroid_lon = excluded.centroid_lon,
       centroid_lat = excluded.centroid_lat,
       continent    = excluded.continent,
       alt_capitals = excluded.alt_capitals`,
  );

  return transaction(db, () => {
    for (const c of countries) {
      stmt.run(
        c.code,
        c.name,
        c.capital,
        c.capitalLonLat[0],
        c.capitalLonLat[1],
        c.centroid[0],
        c.centroid[1],
        c.continent,
        JSON.stringify(c.altCapitals),
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
       (player_name, score, correct_count, best_streak,
        question_count, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertAnswer = db.prepare(
    `INSERT INTO run_answers (run_id, position, code, chosen, correct, ms)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  return transaction(db, () => {
    const info = insertRunRow.run(
      run.playerName,
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
      );
    });

    return id;
  });
}

export function topRuns(db: DatabaseSync, limit: number): RunSummary[] {
  const rows = db
    .prepare(
      `SELECT id, player_name, score, correct_count, best_streak, finished_at
         FROM runs
        ORDER BY score DESC, finished_at ASC
        LIMIT ?`,
    )
    .all(limit) as unknown as RunRow[];

  return rows.map((r) => ({
    id: r.id,
    playerName: r.player_name,
    score: r.score,
    correctCount: r.correct_count,
    bestStreak: r.best_streak,
    finishedAt: r.finished_at,
  }));
}
