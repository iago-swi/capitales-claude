import type { LonLat } from './types.js';
import { BASE_POINTS, MAX_SPEED_BONUS, multiplierFor, QUESTION_MS } from './scoring.js';

const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;

/**
 * Within this distance the drop counts as *correct* — it keeps a streak alive
 * and counts towards "n of 10 answered".
 *
 * 250 km is roughly "the right region of the right country". It is deliberately
 * generous: this mode tests whether you know where a place is, not whether you
 * can hit a pixel.
 */
export const PLACE_CORRECT_KM = 250;

/** Beyond this the drop is worth nothing at all. */
export const PLACE_ZERO_KM = 2500;

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
 * How much of a question's points a drop earns, from 1 (perfect) to 0.
 *
 * The curve is deliberately not linear. A linear fall would make 250 km — the
 * right city, essentially — worth only 90%, which reads as a punishment for
 * being right. Taking the square root of the remaining fraction keeps near
 * misses generous and lets the score fall away sharply only once the guess is
 * genuinely in the wrong place.
 */
export function placementAccuracy(distance: number): number {
  const d = clamp(distance, 0, PLACE_ZERO_KM);
  return Math.sqrt(1 - d / PLACE_ZERO_KM);
}

/**
 * Points for one placement.
 *
 * Same shape as `scoreAnswer`, and the same ceiling: a perfect instant drop on
 * a maxed streak is worth 400, exactly like a perfect instant naming answer. The
 * two modes keep separate leaderboards because they are different skills, but
 * neither should look inflated beside the other.
 *
 * `null` means the question timed out with nothing placed.
 */
export function scorePlacement(
  distance: number | null,
  remainingMs: number,
  streak: number,
  totalMs: number = QUESTION_MS,
): number {
  if (distance === null) return 0;

  const accuracy = placementAccuracy(distance);
  if (accuracy === 0) return 0;

  const remaining = clamp(remainingMs, 0, totalMs);
  const speedBonus = (MAX_SPEED_BONUS * remaining) / totalMs;

  return Math.round((BASE_POINTS + speedBonus) * accuracy * multiplierFor(streak));
}

/** Whether a drop is close enough to keep a streak alive. */
export function isCloseEnough(distance: number | null): boolean {
  return distance !== null && distance <= PLACE_CORRECT_KM;
}
