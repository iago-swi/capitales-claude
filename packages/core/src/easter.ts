/**
 * The knock that opens the credits.
 *
 * Seven presses on the wordmark, which is the idiom Android uses for its build
 * number: familiar enough that someone poking at the logo will find it, quiet
 * enough that nobody finds it by accident.
 *
 * The gesture rather than a key sequence because the game ships as an APK as
 * well, and a phone has no keyboard. A press is the one input a mouse, a
 * finger and a stylus all produce identically, so there is a single code path
 * for every platform instead of one per input device.
 */

/** Presses needed, counted from the first. */
export const EASTER_TAPS = 7;

/**
 * How long a press stays part of the run.
 *
 * Long enough to be tapped deliberately without hurrying, short enough that
 * seven presses spread over a session never add up by themselves.
 */
export const EASTER_WINDOW_MS = 2000;

/**
 * The run length after one more press.
 *
 * Returns 1 when the previous press has gone stale, so a hesitant player starts
 * again rather than being told nothing happened. `lastAt` of null is the first
 * press of a session.
 */
export function nextTapCount(
  count: number,
  now: number,
  lastAt: number | null,
): number {
  if (lastAt === null || now - lastAt > EASTER_WINDOW_MS) return 1;
  return count + 1;
}

/** Whether a run of presses has earned the credits. */
export function isUnlocked(count: number): boolean {
  return count >= EASTER_TAPS;
}

/**
 * Presses still to go, or 0 once it is open.
 *
 * Nothing shows this before the halfway mark: a counter that appears on the
 * first press turns a secret into a button with a progress bar.
 */
export function tapsRemaining(count: number): number {
  return Math.max(0, EASTER_TAPS - count);
}

/** Whether the run is far enough along to hint that something is happening. */
export function shouldHint(count: number): boolean {
  return count >= Math.ceil(EASTER_TAPS / 2) && !isUnlocked(count);
}
