/** Countdown per question, in milliseconds. */
export const QUESTION_MS = 15_000;

/** Points awarded for a correct answer before speed and streak. */
export const BASE_POINTS = 100;

/** Maximum points from answering quickly. */
export const MAX_SPEED_BONUS = 100;

/** Ceiling on the streak multiplier. */
export const MAX_MULTIPLIER = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Multiplier for a streak of consecutive correct answers, counting the current
 * one. The first correct answer of a streak has streak === 1 and multiplier 1.
 */
export function multiplierFor(streak: number): number {
  return clamp(1 + 0.25 * (streak - 1), 1, MAX_MULTIPLIER);
}

/**
 * Points for one answer.
 *
 * A wrong answer or a timeout scores 0. A correct answer scores
 * (base + speed bonus) * streak multiplier, rounded once, here — so the running
 * total shown during play always equals the final score.
 */
export function scoreAnswer(
  correct: boolean,
  remainingMs: number,
  streak: number,
  totalMs: number = QUESTION_MS,
): number {
  if (!correct) return 0;
  const remaining = clamp(remainingMs, 0, totalMs);
  const speedBonus = (MAX_SPEED_BONUS * remaining) / totalMs;
  return Math.round((BASE_POINTS + speedBonus) * multiplierFor(streak));
}

/** How many entries the leaderboard keeps. */
export const LEADERBOARD_SIZE = 10;

/**
 * Whether a finished run earns a place on the leaderboard.
 *
 * The board is only asked for a name when this returns true, which is what
 * makes entering one feel earned rather than clerical.
 *
 * Ties do NOT qualify once the board is full: replaying the same score would
 * otherwise churn the bottom entry forever without ever being an improvement.
 * A zero score never qualifies, however empty the board.
 */
export function qualifiesForLeaderboard(
  score: number,
  board: readonly { score: number }[],
  size: number = LEADERBOARD_SIZE,
): boolean {
  if (score <= 0) return false;

  // Never trust the caller's ordering; the bar is the lowest score still kept.
  const kept = [...board].sort((a, b) => b.score - a.score).slice(0, size);
  if (kept.length < size) return true;

  const lowest = kept[kept.length - 1];
  return lowest === undefined || score > lowest.score;
}

/**
 * A points value with its sign, for showing next to a single answer.
 *
 * A gain is worth announcing as a gain, so it gets an explicit `+`. A loss
 * already carries its minus and must not be given a second sign, and nothing
 * gained is plain `0` rather than a decorated nothing.
 *
 * This lives here rather than in the component because that is the only way it
 * can be tested. The rule used to be a `+` hard-coded in the markup, which was
 * correct right up until a drop past the zero ring started costing points, and
 * then quietly printed `+-15`.
 */
export function formatPoints(points: number): string {
  if (points > 0) return `+${points}`;
  return String(points);
}
