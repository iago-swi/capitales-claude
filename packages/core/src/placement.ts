import type { AnswerRecord, LonLat } from './types.js';
import { BASE_POINTS, MAX_SPEED_BONUS, multiplierFor, QUESTION_MS } from './scoring.js';

const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;

/** Inside this, the drop is a bullseye and earns everything. */
export const PLACE_FULL_KM = 25;

/**
 * How fast the points fall away, in kilometres.
 *
 * This is the constant that decides whether the mode discriminates at all.
 * The first version used sqrt(1 - d/2500), chosen to be kind to near misses —
 * and it was far too kind: 1000 km still paid 77%, so a player five times less
 * precise lost only a sixth of their points and every run landed in the same
 * band. Exponential decay separates them properly: 4x between a careful run
 * and a rough one.
 */
export const PLACE_SCALE_KM = 450;

/** Within this, the drop keeps a streak alive and counts as on target. */
export const PLACE_CORRECT_KM = 250;

/** Past this, a drop stops being an attempt and starts costing points. */
export const PLACE_MISS_KM = 1500;

/** The worst a single drop can cost, reached at twice the miss distance. */
export const PLACE_MAX_PENALTY = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Great-circle distance in kilometres, by the haversine formula.
 *
 * Haversine rather than the simpler spherical law of cosines because the latter
 * loses precision at short distances — exactly the distances that decide a good
 * placement from a perfect one.
 *
 * Both arguments are [lon, lat], as everything in this codebase is.
 */
export function distanceKm(a: LonLat, b: LonLat): number {
  const [lonA, latA] = a;
  const [lonB, latB] = b;

  const dLat = (latB - latA) * DEG;
  const dLon = (lonB - lonA) * DEG;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latA * DEG) * Math.cos(latB * DEG) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The fraction of a question's points a drop earns, from 1 down towards 0.
 *
 * Exponential rather than linear or square-root: knowing a capital to within
 * 100 km is a different achievement from knowing its continent, and the curve
 * has to say so. 100 km keeps 85%, 500 km keeps 35%, 1000 km keeps 11%.
 */
export function placementAccuracy(distance: number): number {
  const d = Math.max(0, distance);
  if (d <= PLACE_FULL_KM) return 1;
  return Math.exp(-(d - PLACE_FULL_KM) / PLACE_SCALE_KM);
}

/**
 * What a drop beyond the miss distance costs, as a negative number.
 *
 * Ramps from nothing at the boundary to the full penalty at twice it, so there
 * is no cliff to fall off — a drop that is merely poor is not punished like one
 * that was never a guess at all.
 *
 * Deliberately flat with respect to the streak multiplier: a good run should
 * not be punished harder for one bad question than a bad run is.
 */
export function placementPenalty(distance: number): number {
  if (distance <= PLACE_MISS_KM) return 0;
  const over = clamp((distance - PLACE_MISS_KM) / PLACE_MISS_KM, 0, 1);
  return -Math.round(PLACE_MAX_PENALTY * over);
}

/**
 * Points for one placement, which may be negative.
 *
 * Same ceiling as `scoreAnswer`: a perfect instant drop on a maxed streak is
 * worth 400, exactly like a perfect instant naming answer. The two modes keep
 * separate leaderboards because they are different skills, but neither should
 * look inflated beside the other.
 *
 * `null` means the question ran out with nothing placed. That costs the full
 * penalty: running the clock down is the one thing worse than a wild guess,
 * because it is not even an attempt.
 */
export function scorePlacement(
  distance: number | null,
  remainingMs: number,
  streak: number,
  totalMs: number = QUESTION_MS,
): number {
  if (distance === null) return -PLACE_MAX_PENALTY;
  if (distance > PLACE_MISS_KM) return placementPenalty(distance);

  const remaining = clamp(remainingMs, 0, totalMs);
  const speedBonus = (MAX_SPEED_BONUS * remaining) / totalMs;

  return Math.round(
    (BASE_POINTS + speedBonus) * placementAccuracy(distance) * multiplierFor(streak),
  );
}

/** Whether a drop is close enough to count as on target and keep a streak. */
export function isCloseEnough(distance: number | null): boolean {
  return distance !== null && distance <= PLACE_CORRECT_KM;
}

/**
 * Mean distance across the placements in a run, in kilometres.
 *
 * The honest summary of a placing run, and the one the results screen leads
 * with. "8 of 10 answered" is naming-mode vocabulary: in placing you answered
 * all ten, and how close you were is the whole story.
 *
 * Timeouts are excluded rather than counted as some arbitrary huge distance,
 * which would swamp the average with a number nobody chose.
 */
export function averageOffKm(answers: readonly AnswerRecord[]): number | null {
  const distances = answers
    .map((a) => a.offKm)
    .filter((d): d is number => typeof d === 'number');
  if (distances.length === 0) return null;
  return distances.reduce((total, d) => total + d, 0) / distances.length;
}
