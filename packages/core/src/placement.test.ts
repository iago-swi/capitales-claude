import { describe, expect, it } from 'vitest';
import {
  averageOffKm,
  distanceKm,
  correctDistanceFor,
  missDistanceFor,
  PLACE_MAX_PENALTY,
  PLACE_FULL_KM,
  fullPenaltyDistanceFor,
  isCloseEnough,
  placementAccuracy,
  placementPenalty,
  scorePlacement,
} from './placement.js';
import type { AnswerRecord } from './types.js';
import { QUESTION_MS } from './scoring.js';

const PARIS: [number, number] = [2.3522, 48.8566];
const LONDON: [number, number] = [-0.1276, 51.5072];
const TOKYO: [number, number] = [139.6917, 35.6895];

describe('distanceKm', () => {
  it('is zero for the same point', () => {
    expect(distanceKm(PARIS, PARIS)).toBe(0);
  });

  it('matches the known Paris–London great-circle distance', () => {
    // ~344 km. A wrong earth radius or a degree/radian slip shows up here.
    expect(distanceKm(PARIS, LONDON)).toBeGreaterThan(330);
    expect(distanceKm(PARIS, LONDON)).toBeLessThan(360);
  });

  it('matches the known Paris–Tokyo distance', () => {
    expect(distanceKm(PARIS, TOKYO)).toBeGreaterThan(9600);
    expect(distanceKm(PARIS, TOKYO)).toBeLessThan(9900);
  });

  it('is symmetric', () => {
    expect(distanceKm(PARIS, TOKYO)).toBeCloseTo(distanceKm(TOKYO, PARIS), 6);
  });

  it('catches a transposed [lat, lon] pair', () => {
    // The same guard the projection tests carry: swapped, Paris is in the
    // Indian Ocean, thousands of kilometres away.
    const swapped: [number, number] = [PARIS[1], PARIS[0]];
    expect(distanceKm(PARIS, swapped)).toBeGreaterThan(5000);
  });

  it('handles the antimeridian without going the long way round', () => {
    const west: [number, number] = [179.5, 0];
    const east: [number, number] = [-179.5, 0];
    // One degree apart across the date line, ~111 km — not ~39 700 km.
    expect(distanceKm(west, east)).toBeLessThan(150);
  });
});

describe('placementAccuracy', () => {
  it('is 1 for a perfect drop', () => {
    expect(placementAccuracy(0)).toBe(1);
    expect(placementAccuracy(20)).toBe(1);
  });

  it('decreases as the guess gets worse, then stays at zero', () => {
    // Strictly falling up to the zero ring, flat on the floor after it. The
    // floor is the point: there is nothing to collect out there any more.
    const zero = missDistanceFor();
    const inside = [0, zero * 0.25, zero * 0.5, zero * 0.9].map((d) =>
      placementAccuracy(d),
    );
    for (let i = 1; i < inside.length; i++) {
      expect(inside[i]!).toBeLessThan(inside[i - 1]!);
    }
    for (const d of [zero, zero * 2, 20000]) {
      expect(placementAccuracy(d)).toBe(0);
    }
  });

  it('actually discriminates, which the first curve did not', () => {
    // The original sqrt curve paid 77% at 1000 km, so every run scored alike.
    // Stated in fractions of the map, because that is what the player sees.
    const reach = 1100;
    expect(placementAccuracy(0.05 * reach, reach)).toBeGreaterThan(0.8);
    expect(placementAccuracy(0.15 * reach, reach)).toBeLessThan(0.55);
    expect(placementAccuracy(0.25 * reach, reach)).toBeLessThan(0.2);
  });

  it('reaches a real zero rather than trailing off towards one', () => {
    // The fault this replaces. An exponential tail always paid something for a
    // drop that was never a guess, and that consolation money is what a player
    // clicking the middle of every country was living on.
    const reach = 1100;
    const zero = missDistanceFor(reach);
    expect(placementAccuracy(zero, reach)).toBe(0);
    expect(placementAccuracy(zero * 1.5, reach)).toBe(0);
    expect(placementAccuracy(zero - 1, reach)).toBeGreaterThan(0);
  });

  it('never returns a negative accuracy', () => {
    for (const d of [-10, 0, 1e9]) {
      expect(placementAccuracy(d)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('placementPenalty', () => {
  it('is nothing at or inside the miss distance', () => {
    expect(placementPenalty(0)).toBe(0);
    expect(placementPenalty(missDistanceFor())).toBe(0);
  });

  it('ramps rather than falling off a cliff', () => {
    const just = placementPenalty(missDistanceFor() + 50);
    expect(just).toBeLessThan(0);
    expect(just).toBeGreaterThan(-15);
  });

  it('reaches the full penalty at the far corner of the map', () => {
    expect(placementPenalty(fullPenaltyDistanceFor())).toBe(-PLACE_MAX_PENALTY);
    expect(placementPenalty(fullPenaltyDistanceFor() * 9)).toBe(
      -PLACE_MAX_PENALTY,
    );
  });
});

describe('scorePlacement', () => {
  it('matches a perfect naming answer when the drop is perfect and instant', () => {
    expect(scorePlacement(0, QUESTION_MS, 1)).toBe(200);
    expect(scorePlacement(0, QUESTION_MS, 5)).toBe(400);
  });

  it('costs points for a wild guess', () => {
    // The penalty ramps, so a drop just past the threshold is only part of the
    // way to the worst case; the far corner of the map is where it bottoms out.
    expect(scorePlacement(missDistanceFor() * 1.5, QUESTION_MS, 5)).toBeLessThan(0);
    expect(scorePlacement(fullPenaltyDistanceFor(), QUESTION_MS, 5)).toBe(
      -PLACE_MAX_PENALTY,
    );
  });

  it('costs the full penalty for placing nothing at all', () => {
    // Worse than a wild guess: not even an attempt.
    expect(scorePlacement(null, QUESTION_MS, 4)).toBe(-PLACE_MAX_PENALTY);
  });

  it('never lets speed or streak rescue a wild guess', () => {
    expect(scorePlacement(4000, QUESTION_MS, 5)).toBeLessThan(0);
    expect(scorePlacement(4000, 0, 1)).toBeLessThan(0);
  });

  it('pays the clock only for a drop that landed on target', () => {
    // The exploit this closes: answering instantly was worth something even
    // when the drop was a shrug, so clicking early beat thinking at all.
    const onTarget = correctDistanceFor() - 1;
    const off = correctDistanceFor() + 1;
    expect(scorePlacement(onTarget, QUESTION_MS, 1)).toBeGreaterThan(
      scorePlacement(onTarget, 0, 1),
    );
    expect(scorePlacement(off, QUESTION_MS, 1)).toBe(scorePlacement(off, 0, 1));
  });

  it('pays much less for a worse drop at the same speed', () => {
    const near = scorePlacement(100, QUESTION_MS / 2, 3);
    const far = scorePlacement(300, QUESTION_MS / 2, 3);
    expect(near).toBeGreaterThan(far * 4);
  });

  it('pays less for the same drop answered later', () => {
    expect(scorePlacement(100, QUESTION_MS, 3)).toBeGreaterThan(
      scorePlacement(100, 0, 3),
    );
  });

  it('applies the streak multiplier', () => {
    // Within a point of double: rounding happens once, at the end, so doubling
    // the multiplier does not exactly double the already-rounded single value.
    expect(scorePlacement(100, QUESTION_MS, 5)).toBeCloseTo(
      scorePlacement(100, QUESTION_MS, 1) * 2,
      -0.5,
    );
    expect(scorePlacement(100, QUESTION_MS, 5)).toBeGreaterThan(
      scorePlacement(100, QUESTION_MS, 1),
    );
  });

  it('returns whole numbers', () => {
    for (let km = 0; km < 4000; km += 137) {
      expect(Number.isInteger(scorePlacement(km, 7000, 2))).toBe(true);
    }
  });

  it('separates a careful run from a rough one', () => {
    // The whole point of the rework. Same speed and streak throughout.
    const runOf = (ds: number[]) =>
      ds.reduce((t, d) => t + scorePlacement(d, QUESTION_MS / 2, 3), 0);
    const careful = runOf([80, 150, 210, 90, 300, 180, 120, 250, 160, 200]);
    const rough = runOf([600, 1100, 850, 400, 1300, 900, 700, 1000, 950, 800]);
    expect(careful).toBeGreaterThan(rough * 3);
  });
});

describe('averageOffKm', () => {
  const answer = (offKm?: number): AnswerRecord => ({
    code: 'FRA',
    chosen: 'Paris',
    correct: false,
    ms: 1000,
    ...(offKm === undefined ? {} : { offKm }),
  });

  it('averages the placements', () => {
    expect(averageOffKm([answer(100), answer(200), answer(300)])).toBe(200);
  });

  it('ignores questions with no placement rather than inventing a distance', () => {
    // A timeout counted as some huge number would swamp the average with a
    // figure the player never chose.
    expect(averageOffKm([answer(100), answer(), answer(300)])).toBe(200);
  });

  it('is null when nothing was ever placed', () => {
    expect(averageOffKm([answer(), answer()])).toBeNull();
    expect(averageOffKm([])).toBeNull();
  });
});

describe('scaling by country size', () => {
  // The reach — furthest corner of the frame from the capital — that the atlas
  // actually produces for these countries at the game's frame size.
  const SWITZERLAND = 278;
  const FRANCE = 1116;
  const CANADA = 5977;
  const VATICAN = 2;

  it('punishes the same error harder in a small country', () => {
    // The fault this fixes: a fixed scale scored 200 km at 68% for the
    // Vatican and, identically, for Russia.
    expect(placementAccuracy(200, SWITZERLAND)).toBe(0);
    expect(placementAccuracy(200, CANADA)).toBeGreaterThan(0.75);
  });

  it('puts the zero ring where a played example said it belonged', () => {
    // 83 km around Bern: far enough that you plainly knew roughly where
    // Switzerland keeps its capital, close enough that guessing cannot reach.
    expect(missDistanceFor(SWITZERLAND)).toBeCloseTo(83, 0);
    expect(scorePlacement(82, QUESTION_MS, 3, SWITZERLAND)).toBeGreaterThan(0);
    expect(scorePlacement(84, QUESTION_MS, 3, SWITZERLAND)).toBeLessThanOrEqual(0);
  });

  it('floors every distance so a micro-state does not demand metre precision', () => {
    // The Vatican's frame is two kilometres across. Without the floor, being on
    // target would mean 300 metres — a pixel-hunting contest, not geography.
    expect(correctDistanceFor(VATICAN)).toBe(PLACE_FULL_KM);
    expect(placementAccuracy(20, VATICAN)).toBe(1);
  });

  it('keeps the penalty inside the map, which an earlier version did not', () => {
    // The miss threshold was once 4x a scale capped at 900 km, so it sat at
    // 1800 km for France — off the edge of a frame whose furthest corner is
    // 1116 km away. A wild guess was free in 157 countries.
    for (const reach of [SWITZERLAND, FRANCE, CANADA, 7788]) {
      expect(missDistanceFor(reach)).toBeLessThan(reach);
      expect(placementPenalty(reach, reach)).toBe(-PLACE_MAX_PENALTY);
    }
  });

  it('moves the on-target and zero distances with the country', () => {
    expect(correctDistanceFor(SWITZERLAND)).toBeLessThan(correctDistanceFor(CANADA));
    expect(missDistanceFor(SWITZERLAND)).toBeLessThan(missDistanceFor(CANADA));
    // 200 km from Bern is not on target; from Ottawa it is.
    expect(isCloseEnough(200, SWITZERLAND)).toBe(false);
    expect(isCloseEnough(200, CANADA)).toBe(true);
  });

  it('falls back to a sensible map size when none is given', () => {
    expect(correctDistanceFor(undefined)).toBe(165);
    expect(correctDistanceFor(Number.NaN)).toBe(165);
    expect(correctDistanceFor(0)).toBe(165);
  });

  it('penalises a wild guess sooner in a small country', () => {
    expect(scorePlacement(900, QUESTION_MS, 3, SWITZERLAND)).toBeLessThan(0);
    expect(scorePlacement(900, QUESTION_MS, 3, CANADA)).toBeGreaterThan(0);
  });
});
