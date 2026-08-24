import { describe, expect, it } from 'vitest';
import { mulberry32, sample, shuffle } from './rng.js';

describe('mulberry32', () => {
  it('produces the same sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = Array.from({ length: 20 }, mulberry32(1));
    const b = Array.from({ length: 20 }, mulberry32(2));
    expect(a).not.toEqual(b);
  });

  it('stays within [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const input = Object.freeze([1, 2, 3, 4, 5]);
    const out = shuffle(mulberry32(3), input);
    expect(out).toHaveLength(5);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it('is deterministic for a given seed', () => {
    const a = shuffle(mulberry32(9), ['a', 'b', 'c', 'd']);
    const b = shuffle(mulberry32(9), ['a', 'b', 'c', 'd']);
    expect(a).toEqual(b);
  });

  it('actually reorders for at least one seed', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const reordered = [0, 1, 2, 3, 4].some(
      (s) => shuffle(mulberry32(s), input).join() !== input.join(),
    );
    expect(reordered).toBe(true);
  });
});

describe('sample', () => {
  it('returns n distinct items', () => {
    const out = sample(mulberry32(11), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4);
    expect(out).toHaveLength(4);
    expect(new Set(out).size).toBe(4);
  });

  it('returns everything when n exceeds the pool size', () => {
    const out = sample(mulberry32(11), [1, 2, 3], 10);
    expect([...out].sort()).toEqual([1, 2, 3]);
  });

  it('returns an empty array for n <= 0', () => {
    expect(sample(mulberry32(1), [1, 2, 3], 0)).toEqual([]);
    expect(sample(mulberry32(1), [1, 2, 3], -5)).toEqual([]);
  });
});
