import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiUnreachableError,
  DatabaseEmptyError,
  loadCountries,
  probeApi,
  saveRun,
  topScores,
} from './client.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('probeApi', () => {
  it('reports the country count when the server answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, countries: 193 })));
    expect(await probeApi()).toEqual({ reachable: true, countries: 193 });
  });

  it('reports unreachable when the connection is refused', async () => {
    // fetch to a closed port rejects with TypeError. This is the single most
    // common failure in local development, so it must be fast and explicit.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    expect(await probeApi()).toEqual({ reachable: false, countries: 0 });
  });

  it('reports unreachable when the request times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('aborted', 'AbortError');
      }),
    );
    expect(await probeApi(10)).toEqual({ reachable: false, countries: 0 });
  });

  it('reports unreachable when something else is on the port', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>hi</html>', { status: 200 })),
    );
    expect(await probeApi()).toEqual({ reachable: false, countries: 0 });
  });
});

describe('loadCountries', () => {
  it('returns the countries the API sent', async () => {
    const countries = [{ code: 'FRA', capital: 'Paris' }];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/api/health')
          ? jsonResponse({ ok: true, countries: 1 })
          : jsonResponse(countries),
      ),
    );
    expect(await loadCountries()).toEqual(countries);
  });

  it('throws ApiUnreachableError naming the address and the fix', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    await expect(loadCountries()).rejects.toThrow(ApiUnreachableError);
    await expect(loadCountries()).rejects.toThrow(/npm run server/);
  });

  it('throws DatabaseEmptyError when nothing is seeded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, countries: 0 })));
    await expect(loadCountries()).rejects.toThrow(DatabaseEmptyError);
    await expect(loadCountries()).rejects.toThrow(/npm run seed/);
  });
});

describe('saveRun', () => {
  const run = {
    playerName: 'Philippe',
    score: 100,
    correctCount: 1,
    bestStreak: 1,
    questionCount: 10,
    startedAt: '2026-08-24T10:00:00.000Z',
    answers: [],
  };

  it('returns the new run id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ id: 7 }, 201)));
    expect(await saveRun(run)).toBe(7);
  });

  it('POSTs JSON to /api/runs', async () => {
    const spy = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ id: 1 }, 201));
    vi.stubGlobal('fetch', spy);
    await saveRun(run);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('/api/runs');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({ playerName: 'Philippe' });
  });

  it('surfaces the server error message on a 400', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'score must be a number' }, 400)),
    );
    await expect(saveRun(run)).rejects.toThrow(/score must be a number/);
  });

  it('throws ApiUnreachableError when the server is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    await expect(saveRun(run)).rejects.toThrow(ApiUnreachableError);
  });
});

describe('topScores', () => {
  it('returns the leaderboard rows', async () => {
    const rows = [{ id: 1, playerName: 'Ada', score: 900 }];
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(rows)));
    expect(await topScores()).toEqual(rows);
  });

  it('passes the limit through as a query parameter', async () => {
    const spy = vi.fn(async (_url: string) => jsonResponse([]));
    vi.stubGlobal('fetch', spy);
    await topScores(3);
    expect(String(spy.mock.calls[0]?.[0])).toContain('limit=3');
  });
});
