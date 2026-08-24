import { describe, expect, it } from 'vitest';
import type { Country } from './types.js';
import { mulberry32 } from './rng.js';
import { buildQuestion, buildRun, isCorrect, OPTION_COUNT } from './questions.js';

function country(
  code: string,
  capital: string,
  continent: string,
  altCapitals: string[] = [],
): Country {
  return {
    code,
    name: code,
    capital,
    capitalLonLat: [0, 0],
    continent,
    altCapitals,
  };
}

const europe = [
  country('FRA', 'Paris', 'Europe'),
  country('DEU', 'Berlin', 'Europe'),
  country('ESP', 'Madrid', 'Europe'),
  country('ITA', 'Rome', 'Europe'),
  country('PRT', 'Lisbon', 'Europe'),
  country('AUT', 'Vienna', 'Europe'),
];
const asia = [
  country('JPN', 'Tokyo', 'Asia'),
  country('KOR', 'Seoul', 'Asia'),
  country('THA', 'Bangkok', 'Asia'),
];
const pool = [...europe, ...asia];

describe('buildQuestion', () => {
  it('offers exactly four options', () => {
    const q = buildQuestion(europe[0]!, pool, mulberry32(1));
    expect(q.options).toHaveLength(OPTION_COUNT);
  });

  it('includes the correct capital at correctIndex', () => {
    const q = buildQuestion(europe[0]!, pool, mulberry32(1));
    expect(q.options[q.correctIndex]).toBe('Paris');
  });

  it('never repeats an option', () => {
    for (let seed = 0; seed < 50; seed++) {
      const q = buildQuestion(europe[0]!, pool, mulberry32(seed));
      expect(new Set(q.options).size).toBe(OPTION_COUNT);
    }
  });

  it('prefers distractors from the same continent', () => {
    for (let seed = 0; seed < 50; seed++) {
      const q = buildQuestion(europe[0]!, pool, mulberry32(seed));
      const asianCapitals = asia.map((c) => c.capital);
      const leaked = q.options.filter((o) => asianCapitals.includes(o));
      expect(leaked, `seed ${seed}`).toHaveLength(0);
    }
  });

  it('falls back to other continents when the continent is too small', () => {
    const tiny = [country('AAA', 'Alpha', 'Tinyland'), ...asia, ...europe];
    const q = buildQuestion(tiny[0]!, tiny, mulberry32(4));
    expect(q.options).toHaveLength(OPTION_COUNT);
    expect(q.options).toContain('Alpha');
    expect(new Set(q.options).size).toBe(OPTION_COUNT);
  });

  it('never uses an alternate capital of the same country as a distractor', () => {
    const zaf = country('ZAF', 'Pretoria', 'Africa', ['Cape Town']);
    const africa = [
      zaf,
      country('KEN', 'Nairobi', 'Africa'),
      country('EGY', 'Cairo', 'Africa'),
      country('GHA', 'Accra', 'Africa'),
      country('MAR', 'Rabat', 'Africa'),
    ];
    for (let seed = 0; seed < 30; seed++) {
      const q = buildQuestion(zaf, africa, mulberry32(seed));
      expect(q.options, `seed ${seed}`).not.toContain('Cape Town');
    }
  });

  it('is deterministic for a given seed', () => {
    const a = buildQuestion(europe[0]!, pool, mulberry32(77));
    const b = buildQuestion(europe[0]!, pool, mulberry32(77));
    expect(a.options).toEqual(b.options);
    expect(a.correctIndex).toBe(b.correctIndex);
  });

  it('varies the correct option position across seeds', () => {
    const positions = new Set(
      Array.from({ length: 40 }, (_, s) =>
        buildQuestion(europe[0]!, pool, mulberry32(s)).correctIndex,
      ),
    );
    expect(positions.size).toBeGreaterThan(1);
  });

  it('throws when the pool is too small to fill four options', () => {
    expect(() =>
      buildQuestion(europe[0]!, [europe[0]!, europe[1]!], mulberry32(1)),
    ).toThrow(/at least/i);
  });
});

describe('buildRun', () => {
  it('returns the requested number of questions', () => {
    expect(buildRun(pool, 5, mulberry32(2))).toHaveLength(5);
  });

  it('never asks about the same country twice', () => {
    const codes = buildRun(pool, 9, mulberry32(2)).map((q) => q.country.code);
    expect(new Set(codes).size).toBe(9);
  });

  it('is deterministic for a given seed', () => {
    const a = buildRun(pool, 5, mulberry32(31)).map((q) => q.country.code);
    const b = buildRun(pool, 5, mulberry32(31)).map((q) => q.country.code);
    expect(a).toEqual(b);
  });

  it('differs across seeds', () => {
    const a = buildRun(pool, 5, mulberry32(1)).map((q) => q.country.code);
    const b = buildRun(pool, 5, mulberry32(2)).map((q) => q.country.code);
    expect(a).not.toEqual(b);
  });

  it('throws when asked for more questions than the pool has countries', () => {
    expect(() => buildRun(pool, 99, mulberry32(1))).toThrow(/only \d+/i);
  });
});

describe('isCorrect', () => {
  const zaf = country('ZAF', 'Pretoria', 'Africa', ['Cape Town']);
  const q = buildQuestion(zaf, [zaf, ...europe], mulberry32(5));

  it('accepts the canonical capital', () => {
    expect(isCorrect(q, 'Pretoria')).toBe(true);
  });

  it('accepts a listed alternate capital', () => {
    expect(isCorrect(q, 'Cape Town')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isCorrect(q, 'Johannesburg')).toBe(false);
    expect(isCorrect(q, 'Paris')).toBe(false);
  });
});
