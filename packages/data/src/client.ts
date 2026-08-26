import type { CountryRecord, Mode, RunInput, RunSummary } from '@capitales/core';

/**
 * Relative, so the browser talks to its own origin and Vite's proxy forwards
 * /api to the server. No CORS, and no host to configure per shell.
 */
const API = '/api';
const ADDRESS = '127.0.0.1:8787';
const PROBE_TIMEOUT_MS = 1500;

export class ApiUnreachableError extends Error {
  constructor() {
    super(`API server not reachable at ${ADDRESS}. Run: npm run server`);
    this.name = 'ApiUnreachableError';
  }
}

export class DatabaseEmptyError extends Error {
  constructor() {
    super('The countries table is empty. Run: npm run seed');
    this.name = 'DatabaseEmptyError';
  }
}

/** Any fetch that failed to reach a server at all. */
function isNetworkFailure(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof DOMException && error.name === 'AbortError')
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, init);
  } catch (error) {
    if (isNetworkFailure(error)) throw new ApiUnreachableError();
    throw error;
  }

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Response had no JSON body; the status line is all we have.
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

/**
 * Bounded reachability check, run once at boot.
 *
 * This exists because the two ways local development breaks — no server, or an
 * unseeded database — otherwise present identically as a blank screen. A fetch
 * to a closed port rejects quickly with a TypeError, but the timeout also
 * covers something else listening on 8787 that never answers.
 */
export async function probeApi(
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<{ reachable: boolean; countries: number }> {
  try {
    const res = await fetch(`${API}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = (await res.json()) as { ok?: boolean; countries?: number };
    if (body.ok !== true || typeof body.countries !== 'number') {
      // Something is listening on the port, but it is not our server.
      return { reachable: false, countries: 0 };
    }
    return { reachable: true, countries: body.countries };
  } catch {
    return { reachable: false, countries: 0 };
  }
}

/**
 * Loads every country, after checking the two failures that would otherwise
 * present as a blank screen: no server, and an unseeded database.
 */
export async function loadCountries(): Promise<CountryRecord[]> {
  const { reachable, countries } = await probeApi();
  if (!reachable) throw new ApiUnreachableError();
  if (countries === 0) throw new DatabaseEmptyError();
  return request<CountryRecord[]>('/countries');
}

export async function saveRun(run: RunInput): Promise<number> {
  const { id } = await request<{ id: number }>('/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(run),
  });
  return id;
}

export async function topScores(
  limit = 10,
  mode: Mode = 'name',
): Promise<RunSummary[]> {
  return request<RunSummary[]>(`/leaderboard?limit=${limit}&mode=${mode}`);
}

/**
 * Empties one mode's board and returns how many runs were discarded.
 *
 * The only call in this client that destroys anything. Scoped to a mode
 * because naming and placing are separate boards and the player is looking at
 * one of them.
 */
export async function clearScores(mode: Mode = 'name'): Promise<number> {
  const { cleared } = await request<{ cleared: number }>(
    `/leaderboard?mode=${mode}`,
    { method: 'DELETE' },
  );
  return cleared;
}
