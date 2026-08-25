import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CountryRecord, RunInput } from '@capitales/core';
import {
  countCountries,
  insertRun,
  listCountries,
  openDb,
  seedCountries,
  topRuns,
} from './db.js';

function fixture(code: string, capital: string, alt: string[] = []): CountryRecord {
  return {
    code,
    name: { en: `Name of ${code}`, fr: `Nom de ${code}` },
    capital: { en: capital, fr: `${capital} (fr)` },
    altCapitals: { en: alt, fr: alt.map((a) => `${a} (fr)`) },
    capitalLonLat: [2.3522, 48.8566],
    continent: 'Europe',
  };
}

function run(overrides: Partial<RunInput> = {}): RunInput {
  return {
    playerName: 'Philippe',
    mode: 'name',
    score: 2400,
    correctCount: 8,
    bestStreak: 4,
    questionCount: 10,
    startedAt: '2026-08-24T10:00:00.000Z',
    answers: [
      { code: 'FRA', chosen: 'Paris', correct: true, ms: 1200 },
      { code: 'DEU', chosen: null, correct: false, ms: 15000 },
    ],
    ...overrides,
  };
}

function fresh() {
  return openDb(':memory:');
}

describe('openDb', () => {
  it('creates all three tables', () => {
    const names = fresh()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(names).toContain('countries');
    expect(names).toContain('runs');
    expect(names).toContain('run_answers');
  });

  it('enables foreign key enforcement', () => {
    const row = fresh().prepare('PRAGMA foreign_keys').get() as {
      foreign_keys: number;
    };
    expect(row.foreign_keys).toBe(1);
  });

  it('can be opened repeatedly over the same schema', () => {
    fresh();
    expect(() => fresh()).not.toThrow();
  });
});

describe('seedCountries', () => {
  it('inserts every country and reports the count', () => {
    const db = fresh();
    const written = seedCountries(db, [
      fixture('FRA', 'Paris'),
      fixture('DEU', 'Berlin'),
    ]);
    expect(written).toBe(2);
    expect(countCountries(db)).toBe(2);
  });

  it('is idempotent rather than duplicating', () => {
    const db = fresh();
    const rows = [fixture('FRA', 'Paris'), fixture('DEU', 'Berlin')];
    seedCountries(db, rows);
    seedCountries(db, rows);
    expect(countCountries(db)).toBe(2);
  });

  it('updates changed values on re-seed', () => {
    const db = fresh();
    seedCountries(db, [fixture('BOL', 'La Paz')]);
    seedCountries(db, [fixture('BOL', 'Sucre')]);
    expect(listCountries(db)[0]?.capital.en).toBe('Sucre');
  });

  it('starts from zero on an empty database', () => {
    expect(countCountries(fresh())).toBe(0);
  });
});

describe('listCountries', () => {
  it('round-trips coordinates in [lon, lat] order', () => {
    const db = fresh();
    seedCountries(db, [fixture('FRA', 'Paris')]);
    const [france] = listCountries(db);
    expect(france?.capitalLonLat).toEqual([2.3522, 48.8566]);
  });

  it('round-trips altCapitals through JSON', () => {
    const db = fresh();
    seedCountries(db, [
      fixture('ZAF', 'Pretoria', ['Cape Town', 'Bloemfontein']),
    ]);
    expect(listCountries(db)[0]?.altCapitals.en).toEqual([
      'Cape Town',
      'Bloemfontein',
    ]);
    expect(listCountries(db)[0]?.altCapitals.fr).toEqual([
      'Cape Town (fr)',
      'Bloemfontein (fr)',
    ]);
  });

  it('defaults altCapitals to an empty array', () => {
    const db = fresh();
    seedCountries(db, [fixture('FRA', 'Paris')]);
    expect(listCountries(db)[0]?.altCapitals.en).toEqual([]);
  });

  it('returns rows sorted by code', () => {
    const db = fresh();
    seedCountries(db, [fixture('ZAF', 'Pretoria'), fixture('ALB', 'Tirana')]);
    expect(listCountries(db).map((c) => c.code)).toEqual(['ALB', 'ZAF']);
  });
});

describe('insertRun', () => {
  it('returns a new id for each run', () => {
    const db = fresh();
    const first = insertRun(db, run());
    const second = insertRun(db, run());
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
  });

  it('persists every answer against the run', () => {
    const db = fresh();
    const id = insertRun(db, run());
    const rows = db
      .prepare(
        `SELECT position, code, chosen, correct, ms
           FROM run_answers WHERE run_id = ? ORDER BY position`,
      )
      .all(id);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      position: 0,
      code: 'FRA',
      chosen: 'Paris',
      correct: 1,
    });
    expect(rows[1]).toMatchObject({
      position: 1,
      code: 'DEU',
      chosen: null,
      correct: 0,
    });
  });

  it('rolls back the whole run if one answer is invalid', () => {
    const db = fresh();
    const broken = run({
      answers: [
        { code: 'FRA', chosen: 'Paris', correct: true, ms: 100 },
        { code: 'DEU', chosen: 'Berlin', correct: true, ms: Number.NaN },
      ],
    });
    expect(() => insertRun(db, broken)).toThrow();

    // Atomicity: neither the run nor its first answer may survive.
    const runs = db.prepare('SELECT COUNT(*) AS n FROM runs').get() as {
      n: number;
    };
    const answers = db
      .prepare('SELECT COUNT(*) AS n FROM run_answers')
      .get() as { n: number };
    expect(runs.n).toBe(0);
    expect(answers.n).toBe(0);
  });

  it('accepts a run with no answers', () => {
    expect(() => insertRun(fresh(), run({ answers: [] }))).not.toThrow();
  });
});

describe('topRuns', () => {
  it('sorts by score, highest first', () => {
    const db = fresh();
    insertRun(db, run({ playerName: 'Low', score: 100 }));
    insertRun(db, run({ playerName: 'High', score: 900 }));
    insertRun(db, run({ playerName: 'Mid', score: 500 }));
    expect(topRuns(db, 10).map((r) => r.playerName)).toEqual([
      'High',
      'Mid',
      'Low',
    ]);
  });

  it('respects the limit', () => {
    const db = fresh();
    for (let i = 0; i < 5; i++) insertRun(db, run({ score: i * 100 }));
    expect(topRuns(db, 2)).toHaveLength(2);
  });

  it('returns an empty list when nothing has been played', () => {
    expect(topRuns(fresh(), 10)).toEqual([]);
  });

  it('includes the fields the leaderboard renders', () => {
    const db = fresh();
    insertRun(db, run());
    const [top] = topRuns(db, 1);
    expect(top).toMatchObject({
      playerName: 'Philippe',
      score: 2400,
      correctCount: 8,
      bestStreak: 4,
    });
    expect(typeof top?.id).toBe('number');
    expect(top?.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('opening a database made by an older build', () => {
  /**
   * Every other test here uses ':memory:', which always gets today's schema —
   * so none of them ever exercised the upgrade path. Adding `mode` shipped an
   * index over a column that older databases did not have, and openDb threw
   * "SQL logic error" on every existing installation. This is that path.
   */
  function legacyDbPath(): string {
    return path.join(
      mkdtempSync(path.join(tmpdir(), 'capitales-legacy-')),
      'capitales.db',
    );
  }

  function createLegacy(file: string): void {
    const db = new DatabaseSync(file);
    db.exec(`
      CREATE TABLE countries (
        code TEXT PRIMARY KEY, name_en TEXT NOT NULL, name_fr TEXT NOT NULL,
        capital_en TEXT NOT NULL, capital_fr TEXT NOT NULL,
        capital_lon REAL NOT NULL, capital_lat REAL NOT NULL,
        continent TEXT NOT NULL,
        alt_capitals_en TEXT NOT NULL DEFAULT '[]',
        alt_capitals_fr TEXT NOT NULL DEFAULT '[]'
      ) STRICT;
      CREATE TABLE runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, player_name TEXT NOT NULL,
        score INTEGER NOT NULL, correct_count INTEGER NOT NULL,
        best_streak INTEGER NOT NULL, question_count INTEGER NOT NULL,
        started_at TEXT NOT NULL, finished_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE run_answers (
        run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        position INTEGER NOT NULL, code TEXT NOT NULL, chosen TEXT,
        correct INTEGER NOT NULL, ms INTEGER NOT NULL,
        PRIMARY KEY (run_id, position)
      ) STRICT;
      CREATE INDEX idx_runs_score ON runs (score DESC);
    `);
    db.prepare(
      `INSERT INTO runs (player_name, score, correct_count, best_streak,
                         question_count, started_at, finished_at)
       VALUES ('Ancien', 1500, 7, 3, 10, '2026-01-01T00:00:00.000Z',
               '2026-01-01T00:05:00.000Z')`,
    ).run();
    db.close();
  }

  it('opens without throwing', () => {
    const file = legacyDbPath();
    createLegacy(file);
    expect(() => openDb(file)).not.toThrow();
  });

  it('keeps the scores that were already there', () => {
    const file = legacyDbPath();
    createLegacy(file);
    const db = openDb(file);
    const board = topRuns(db, 10, 'name');
    expect(board).toHaveLength(1);
    expect(board[0]?.playerName).toBe('Ancien');
    // A run filed before modes existed was a naming run.
    expect(board[0]?.mode).toBe('name');
  });

  it('accepts a placing run afterwards', () => {
    const file = legacyDbPath();
    createLegacy(file);
    const db = openDb(file);
    insertRun(db, run({ playerName: 'Nouveau', mode: 'place', score: 900 }));
    expect(topRuns(db, 10, 'place').map((r) => r.playerName)).toEqual(['Nouveau']);
    // The old run is still on its own board, untouched.
    expect(topRuns(db, 10, 'name').map((r) => r.playerName)).toEqual(['Ancien']);
  });
});
