import { describe, expect, it } from 'vitest';
import {
  distanceKm,
  PLACE_CORRECT_KM,
  PLACE_ZERO_KM,
  placementAccuracy,
  scorePlacement,
} from './placement.js';
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
  });

  it('is 0 at and beyond the zero distance', () => {
    expect(placementAccuracy(PLACE_ZERO_KM)).toBe(0);
    expect(placementAccuracy(PLACE_ZERO_KM * 3)).toBe(0);
  });

  it('still pays well inside the correct radius', () => {
    // Landing on the right city should not feel like a near miss.
    expect(placementAccuracy(PLACE_CORRECT_KM)).toBeGreaterThan(0.7);
  });

  it('decreases as the guess gets worse', () => {
    const values = [0, 100, 500, 1000, 2000].map(placementAccuracy);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeLessThan(values[i - 1]!);
    }
  });

  it('never returns a negative accuracy', () => {
    for (const d of [-10, 0, 1e9]) {
      expect(placementAccuracy(d)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('scorePlacement', () => {
  it('matches a perfect naming answer when the drop is perfect and instant', () => {
    // Both modes top out at the same number, so neither looks inflated next to
    // the other even though the boards are kept apart.
    expect(scorePlacement(0, QUESTION_MS, 1)).toBe(200);
    expect(scorePlacement(0, QUESTION_MS, 5)).toBe(400);
  });

  it('scores zero beyond the zero distance, however fast', () => {
    expect(scorePlacement(PLACE_ZERO_KM + 1, QUESTION_MS, 5)).toBe(0);
  });

  it('pays less for a worse drop at the same speed', () => {
    const near = scorePlacement(50, QUESTION_MS / 2, 3);
    const far = scorePlacement(900, QUESTION_MS / 2, 3);
    expect(near).toBeGreaterThan(far);
  });

  it('pays less for the same drop answered later', () => {
    const quick = scorePlacement(100, QUESTION_MS, 3);
    const slow = scorePlacement(100, 0, 3);
    expect(quick).toBeGreaterThan(slow);
  });

  it('applies the streak multiplier', () => {
    const first = scorePlacement(100, QUESTION_MS, 1);
    const fifth = scorePlacement(100, QUESTION_MS, 5);
    expect(fifth).toBe(first * 2);
  });

  it('returns whole numbers', () => {
    for (let km = 0; km < 2500; km += 137) {
      expect(Number.isInteger(scorePlacement(km, 7000, 2))).toBe(true);
    }
  });

  it('treats a timeout, with no placement at all, as zero', () => {
    expect(scorePlacement(null, QUESTION_MS, 4)).toBe(0);
  });
});
