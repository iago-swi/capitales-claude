import { describe, expect, it } from 'vitest';
import {
  averageOffKm,
  distanceKm,
  PLACE_CORRECT_KM,
  PLACE_MAX_PENALTY,
  PLACE_MISS_KM,
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

  it('decreases as the guess gets worse', () => {
    const values = [0, 100, 500, 1000, 2000].map(placementAccuracy);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeLessThan(values[i - 1]!);
    }
  });

  it('actually discriminates, which the first curve did not', () => {
    // The original sqrt curve paid 77% at 1000 km, so every run scored alike.
    // Knowing a capital to 100 km must be worth far more than knowing its
    // continent.
    expect(placementAccuracy(100)).toBeGreaterThan(0.8);
    expect(placementAccuracy(500)).toBeLessThan(0.4);
    expect(placementAccuracy(1000)).toBeLessThan(0.15);
    expect(placementAccuracy(100) / placementAccuracy(1000)).toBeGreaterThan(6);
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
    expect(placementPenalty(PLACE_MISS_KM)).toBe(0);
  });

  it('ramps rather than falling off a cliff', () => {
    const just = placementPenalty(PLACE_MISS_KM + 50);
    expect(just).toBeLessThan(0);
    expect(just).toBeGreaterThan(-15);
  });

  it('reaches the full penalty at twice the miss distance', () => {
    expect(placementPenalty(PLACE_MISS_KM * 2)).toBe(-PLACE_MAX_PENALTY);
    expect(placementPenalty(PLACE_MISS_KM * 9)).toBe(-PLACE_MAX_PENALTY);
  });
});

describe('scorePlacement', () => {
  it('matches a perfect naming answer when the drop is perfect and instant', () => {
    expect(scorePlacement(0, QUESTION_MS, 1)).toBe(200);
    expect(scorePlacement(0, QUESTION_MS, 5)).toBe(400);
  });

  it('costs points for a wild guess', () => {
    expect(scorePlacement(3000, QUESTION_MS, 5)).toBe(-PLACE_MAX_PENALTY);
  });

  it('costs the full penalty for placing nothing at all', () => {
    // Worse than a wild guess: not even an attempt.
    expect(scorePlacement(null, QUESTION_MS, 4)).toBe(-PLACE_MAX_PENALTY);
  });

  it('never lets speed or streak rescue a wild guess', () => {
    expect(scorePlacement(4000, QUESTION_MS, 5)).toBeLessThan(0);
    expect(scorePlacement(4000, 0, 1)).toBeLessThan(0);
  });

  it('pays much less for a worse drop at the same speed', () => {
    const near = scorePlacement(100, QUESTION_MS / 2, 3);
    const far = scorePlacement(900, QUESTION_MS / 2, 3);
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
