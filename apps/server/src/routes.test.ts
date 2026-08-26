import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CountryRecord, RunInput } from '@capitales/core';
import { openDb, seedCountries } from './db.js';
import { createServer } from './routes.js';

let server: Server;
let base: string;

function fixture(code: string, capital: string): CountryRecord {
  return {
    code,
    name: { en: `Name of ${code}`, fr: `Nom de ${code}` },
    capital: { en: capital, fr: `${capital} (fr)` },
    altCapitals: { en: [], fr: [] },
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
    answers: [{ code: 'FRA', chosen: 'Paris', correct: true, ms: 1200 }],
    ...overrides,
  };
}

async function listen(s: Server): Promise<string> {
  // Port 0 asks the OS for any free port, so tests never collide with a
  // running dev server or with each other.
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
  const { port } = s.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function post(path: string, body: unknown): Promise<Response> {
  return fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(async () => {
  const db = openDb(':memory:');
  seedCountries(db, [fixture('FRA', 'Paris'), fixture('DEU', 'Berlin')]);
  server = createServer(db);
  base = await listen(server);
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('GET /api/health', () => {
  it('reports ok and the country count', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, countries: 2 });
  });

  it('reports zero countries on an unseeded database', async () => {
    const empty = createServer(openDb(':memory:'));
    const url = await listen(empty);
    const res = await fetch(`${url}/api/health`);
    expect(await res.json()).toEqual({ ok: true, countries: 0 });
    await new Promise<void>((resolve) => empty.close(() => resolve()));
  });
});

describe('GET /api/countries', () => {
  it('returns every country as JSON', async () => {
    const res = await fetch(`${base}/api/countries`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body = (await res.json()) as CountryRecord[];
    expect(body).toHaveLength(2);
    expect(body[0]?.code).toBe('DEU');
  });

  it('preserves [lon, lat] order across the wire', async () => {
    const body = (await (await fetch(`${base}/api/countries`)).json()) as CountryRecord[];
    expect(body[0]?.capitalLonLat).toEqual([2.3522, 48.8566]);
  });
});

describe('POST /api/runs', () => {
  it('stores a run and returns its id', async () => {
    const res = await post('/api/runs', run());
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: number };
    expect(body.id).toBeGreaterThan(0);
  });

  it('makes the run visible on the leaderboard', async () => {
    await post('/api/runs', run({ playerName: 'Ada', score: 3100 }));
    const board = (await (await fetch(`${base}/api/leaderboard`)).json()) as {
      playerName: string;
      score: number;
    }[];
    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({ playerName: 'Ada', score: 3100 });
  });

  it('rejects a body that is not JSON', async () => {
    const res = await post('/api/runs', 'this is not json');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/json/i);
  });

  it('rejects a run missing required fields', async () => {
    const res = await post('/api/runs', { playerName: 'Nobody' });
    expect(res.status).toBe(400);
  });

  it('rejects a run whose score is not a number', async () => {
    const res = await post('/api/runs', run({ score: 'lots' as never }));
    expect(res.status).toBe(400);
  });

  it('rejects a run whose answers are not an array', async () => {
    const res = await post('/api/runs', run({ answers: 'none' as never }));
    expect(res.status).toBe(400);
  });

  it('stores nothing when the body is rejected', async () => {
    await post('/api/runs', { playerName: 'Nobody' });
    expect(await (await fetch(`${base}/api/leaderboard`)).json()).toEqual([]);
  });
});

describe('GET /api/leaderboard', () => {
  it('sorts by score, highest first', async () => {
    await post('/api/runs', run({ playerName: 'Low', score: 100 }));
    await post('/api/runs', run({ playerName: 'High', score: 900 }));
    const board = (await (await fetch(`${base}/api/leaderboard`)).json()) as {
      playerName: string;
    }[];
    expect(board.map((r) => r.playerName)).toEqual(['High', 'Low']);
  });

  it('honours an explicit limit', async () => {
    for (let i = 0; i < 5; i++) await post('/api/runs', run({ score: i * 10 }));
    const board = await (await fetch(`${base}/api/leaderboard?limit=2`)).json();
    expect(board).toHaveLength(2);
  });

  it('ignores a nonsensical limit rather than failing', async () => {
    await post('/api/runs', run());
    for (const bad of ['abc', '-5', '0', '99999']) {
      const res = await fetch(`${base}/api/leaderboard?limit=${bad}`);
      expect(res.status, bad).toBe(200);
      expect(Array.isArray(await res.json()), bad).toBe(true);
    }
  });

  it('returns an empty array before anything is played', async () => {
    expect(await (await fetch(`${base}/api/leaderboard`)).json()).toEqual([]);
  });
});

describe('the append-only guarantee', () => {
  // Spec section 5.4: with no security-rules layer, "runs cannot be edited"
  // holds only because no such route exists. Assert it rather than assume it.
  //
  // The guarantee is narrower than it once was: a whole board can now be
  // cleared on purpose. What survives, and what these tests pin down, is that
  // no route can reach in and alter one run.
  it('refuses to update an existing run', async () => {
    const { id } = (await (await post('/api/runs', run())).json()) as { id: number };
    for (const method of ['PUT', 'PATCH']) {
      const res = await fetch(`${base}/api/runs/${id}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ score: 999999 }),
      });
      expect(res.status, method).toBe(404);
    }
  });

  it('refuses to delete an existing run', async () => {
    const { id } = (await (await post('/api/runs', run())).json()) as { id: number };
    const res = await fetch(`${base}/api/runs/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(await (await fetch(`${base}/api/leaderboard`)).json()).toHaveLength(1);
  });

  it('refuses to write to countries', async () => {
    const res = await post('/api/countries', fixture('XXX', 'Nowhere'));
    expect(res.status).toBe(404);
  });
});

describe('clearing a board', () => {
  it('empties the mode asked for and reports the count', async () => {
    await post('/api/runs', run());
    await post('/api/runs', run());

    const res = await fetch(`${base}/api/leaderboard`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cleared: 2 });
    expect(await (await fetch(`${base}/api/leaderboard`)).json()).toHaveLength(0);
  });

  it('leaves the other board alone', async () => {
    // Naming and placing are separate boards, and the player is looking at
    // exactly one of them. Wiping the other as a side effect would be a shock.
    await post('/api/runs', run());
    await post('/api/runs', { ...run(), mode: 'place' });

    await fetch(`${base}/api/leaderboard?mode=place`, { method: 'DELETE' });

    expect(
      await (await fetch(`${base}/api/leaderboard?mode=place`)).json(),
    ).toHaveLength(0);
    expect(
      await (await fetch(`${base}/api/leaderboard?mode=name`)).json(),
    ).toHaveLength(1);
  });

  it('is harmless on a board that is already empty', async () => {
    const res = await fetch(`${base}/api/leaderboard`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cleared: 0 });
  });
});

describe('unknown routes', () => {
  it('returns 404 JSON, never an HTML error page', async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(((await res.json()) as { error: string }).error).toBeDefined();
  });

  it('returns 404 for a path outside /api', async () => {
    expect((await fetch(`${base}/`)).status).toBe(404);
  });
});
