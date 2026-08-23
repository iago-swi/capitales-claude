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
