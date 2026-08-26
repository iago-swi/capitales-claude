/**
 * The storage layer for the single-file build.
 *
 * Exposes exactly the three functions `apps/web` imports from
 * `@capitales/data` — `loadCountries`, `saveRun`, `topScores` — but backed by
 * the country data compiled into the bundle and by `localStorage` instead of an
 * HTTP API. `apps/single/vite.config.ts` aliases one package onto the other, so
 * not a single line of the game, the UI or the store knows which one it got.
 *
 * That substitution is only possible because nothing above this layer ever knew
 * a database existed.
 */
import type { CountryRecord, Mode, RunInput, RunSummary } from '@capitales/core';
import capitals from '@capitales/data/capitals.json';

const STORE_KEY = 'capitales.runs.v1';

/**
 * Runs kept on disk. The leaderboard shows ten; keeping a few more means a
 * deleted or beaten score still has something to fall back on, while staying
 * far inside the ~5 MB localStorage budget.
 */
const MAX_KEPT = 50;

/** What actually goes into localStorage — the answer detail is dropped. */
interface StoredRun extends RunSummary {
  questionCount: number;
  startedAt: string;
}

function readAll(): StoredRun[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredRun[]) : [];
  } catch {
    // Corrupt or unavailable storage must not stop someone playing.
    return [];
  }
}

function writeAll(runs: StoredRun[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(runs));
  } catch {
    // Private browsing, a full quota, or storage disabled. The score is lost,
    // the game is not.
  }
}

/** Immediate: the data is already in the bundle. */
export async function loadCountries(): Promise<CountryRecord[]> {
  return capitals as unknown as CountryRecord[];
}

export async function saveRun(run: RunInput): Promise<number> {
  const runs = readAll();
  const id = runs.reduce((max, r) => Math.max(max, r.id), 0) + 1;

  runs.push({
    id,
    playerName: run.playerName,
    mode: run.mode,
    score: run.score,
    correctCount: run.correctCount,
    bestStreak: run.bestStreak,
    questionCount: run.questionCount,
    startedAt: run.startedAt,
    finishedAt: new Date().toISOString(),
  });

  // Same ordering as the SQL server, ties broken by who got there first, so
  // the leaderboard does not reshuffle equal scores between reloads.
  runs.sort(
    (a, b) => b.score - a.score || a.finishedAt.localeCompare(b.finishedAt),
  );
  writeAll(runs.slice(0, MAX_KEPT));

  return id;
}

export async function topScores(
  limit = 10,
  mode: Mode = 'name',
): Promise<RunSummary[]> {
  return readAll()
    .filter((r) => (r.mode ?? 'name') === mode)
    .slice(0, Math.max(0, limit))
    .map(({ id, playerName, mode: m, score, correctCount, bestStreak, finishedAt }) => ({
      id,
      playerName,
      mode: m ?? 'name',
      score,
      correctCount,
      bestStreak,
      finishedAt,
    }));
}

/**
 * Empties one mode's board and returns how many runs were discarded.
 *
 * The offline twin of the server's `DELETE /api/leaderboard`. Scoped to a mode
 * for the same reason: naming and placing are separate boards, and clearing
 * the one you are reading should not quietly take the other with it.
 */
export async function clearScores(mode: Mode = 'name'): Promise<number> {
  const all = readAll();
  const kept = all.filter((r) => (r.mode ?? 'name') !== mode);
  writeAll(kept);
  return all.length - kept.length;
}
