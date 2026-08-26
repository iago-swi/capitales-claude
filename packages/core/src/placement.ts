import type { AnswerRecord, LonLat } from './types.js';
import { BASE_POINTS, MAX_SPEED_BONUS, multiplierFor, QUESTION_MS } from './scoring.js';

const EARTH_RADIUS_KM = 6371;
const DEG = Math.PI / 180;

/**
 * Every distance below is a fraction of the map's reach — the furthest the
 * player could possibly be wrong given what is on screen.
 *
 * The first two versions of this scoring both failed on the same mistake:
 * calibrating against absolute kilometres. The map shows one country and
 * nothing else, so the frame bounds the error. You cannot drop a marker 1800 km
 * from Paris, because 1800 km from Paris is not on screen. A miss threshold at
 * 1800 km therefore sat off the edge of the map, and measurement confirmed it:
 * the penalty was unreachable in 157 of 193 countries, so a wild guess was free
 * and every run landed in the same band.
 *
 * Fractions of the reach cannot have that failure. The whole scale is, by
 * construction, exactly as wide as the mistakes a player can actually make.
 */
export const PLACE_TARGET_FRACTION = 0.15;

/**
 * The zero ring sits at this many on-target distances from the capital.
 *
 * Past it a drop is worth nothing at all, and then less than nothing. Two was
 * chosen from a played example rather than a formula: 83 km around Bern, which
 * is far enough that you plainly knew roughly where Switzerland keeps its
 * capital, and close enough that guessing cannot wander into it.
 */
export const PLACE_ZERO_MULTIPLE = 2;

/**
 * Shape of the fall from a bullseye to the zero ring.
 *
 * 1 is linear. The earlier curve was exponential, which never actually reaches
 * zero — there was always a consolation payment for being vaguely in the
 * region, and consolation payments are exactly what a guesser lives on.
 */
export const PLACE_FALLOFF = 1;

/**
 * Inside this, the drop is a bullseye and earns everything.
 *
 * Absolute rather than a fraction, and it doubles as the floor under every
 * derived distance. Without it the Vatican — whose frame is two kilometres
 * across — would demand precision of 300 metres to count as on target, which is
 * a pixel-hunting contest rather than a geography question.
 */
export const PLACE_FULL_KM = 25;

/** Fallback when the caller has no frame to offer — roughly a France. */
export const PLACE_DEFAULT_REACH_KM = 1100;

/** The worst a single drop can cost, reached at the far corner of the frame. */
export const PLACE_MAX_PENALTY = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function reach(reachKm?: number): number {
  if (reachKm === undefined || !Number.isFinite(reachKm) || reachKm <= 0) {
    return PLACE_DEFAULT_REACH_KM;
  }
  return reachKm;
}

/**
 * Within this, the drop is on target: it keeps a streak, counts in n/10, and is
 * the only thing that earns the speed bonus.
 *
 * A fraction of what is on screen, because that is what makes two countries
 * comparable: 200 km from Bern means you missed Switzerland entirely, while
 * 200 km from Ottawa is a good guess, and the reach of each map says so.
 */
export function correctDistanceFor(reachKm?: number): number {
  return Math.max(PLACE_FULL_KM, reach(reachKm) * PLACE_TARGET_FRACTION);
}

/**
 * The zero ring: no points at all here, and negative points past it.
 *
 * A real edge rather than an asymptote. The curve it ends used to trail off
 * towards zero without arriving, so a drop that was nowhere near still paid
 * something, and a player who clicked the middle of every country without
 * knowing a single capital collected 1111 points a run.
 */
export function missDistanceFor(reachKm?: number): number {
  return correctDistanceFor(reachKm) * PLACE_ZERO_MULTIPLE;
}

/** Where the penalty reaches its worst: the far corner of the map. */
export function fullPenaltyDistanceFor(reachKm?: number): number {
  return Math.max(reach(reachKm), missDistanceFor(reachKm) * 1.5);
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
 * The fraction of a question's points a drop earns, from 1 down to a real 0.
 *
 * Full inside the bullseye, then straight down to nothing at the zero ring.
 * The straight line matters less than where it ends: an exponential tail keeps
 * paying for drops that were never a guess, and that tail is what a player
 * exploiting the shape of countries was living on.
 */
export function placementAccuracy(distance: number, reachKm?: number): number {
  const d = Math.max(0, distance);
  if (d <= PLACE_FULL_KM) return 1;

  const zero = missDistanceFor(reachKm);
  if (d >= zero) return 0;

  const t = (d - PLACE_FULL_KM) / (zero - PLACE_FULL_KM);
  return (1 - t) ** PLACE_FALLOFF;
}

/**
 * What a drop beyond the zero ring costs, as a negative number.
 *
 * Ramps from nothing at the boundary to the full penalty at the far corner of
 * the frame, so there is no cliff to fall off — a drop that is merely poor is
 * not punished like one that was never a guess at all. The rule a player can
 * hold in their head: the corner of the map costs you a hundred.
 *
 * Deliberately flat with respect to the streak multiplier: a good run should
 * not be punished harder for one bad question than a bad run is.
 */
export function placementPenalty(distance: number, reachKm?: number): number {
  const miss = missDistanceFor(reachKm);
  if (distance <= miss) return 0;
  const span = Math.max(1, fullPenaltyDistanceFor(reachKm) - miss);
  const over = clamp((distance - miss) / span, 0, 1);
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
  reachKm?: number,
  totalMs: number = QUESTION_MS,
): number {
  if (distance === null) return -PLACE_MAX_PENALTY;
  if (distance >= missDistanceFor(reachKm)) {
    return placementPenalty(distance, reachKm);
  }

  // The clock pays only for drops that landed in the target. Answering fast is
  // a way of showing you knew; it is not a substitute for knowing, and a bonus
  // that pays out on a shrug rewards clicking early over thinking at all.
  const onTarget = distance <= correctDistanceFor(reachKm);
  const remaining = clamp(remainingMs, 0, totalMs);
  const speedBonus = onTarget ? (MAX_SPEED_BONUS * remaining) / totalMs : 0;

  return Math.round(
    (BASE_POINTS + speedBonus) *
      placementAccuracy(distance, reachKm) *
      multiplierFor(streak),
  );
}

/** Whether a drop is close enough to count as on target and keep a streak. */
export function isCloseEnough(
  distance: number | null,
  reachKm?: number,
): boolean {
  return distance !== null && distance <= correctDistanceFor(reachKm);
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
