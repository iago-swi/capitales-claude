import { describe, expect, it } from 'vitest';
import type { CountryRecord, RunSummary } from './types.js';
import { localize } from './localize.js';
import { qualifiesForLeaderboard, LEADERBOARD_SIZE } from './scoring.js';

const zaf: CountryRecord = {
  code: 'ZAF',
  name: { en: 'South Africa', fr: 'Afrique du Sud' },
  capital: { en: 'Pretoria', fr: 'Pretoria' },
  altCapitals: {
    en: ['Cape Town', 'Bloemfontein'],
    fr: ['Le Cap', 'Bloemfontein'],
  },
  capitalLonLat: [28.227, -25.708],
  continent: 'Africa',
};

describe('localize', () => {
  it('collapses a record to English', () => {
    const c = localize(zaf, 'en');
    expect(c.name).toBe('South Africa');
    expect(c.capital).toBe('Pretoria');
    expect(c.altCapitals).toEqual(['Cape Town', 'Bloemfontein']);
  });

  it('collapses a record to French', () => {
    const c = localize(zaf, 'fr');
    expect(c.name).toBe('Afrique du Sud');
    expect(c.capital).toBe('Pretoria');
    expect(c.altCapitals).toEqual(['Le Cap', 'Bloemfontein']);
  });

  it('carries the language-independent fields through unchanged', () => {
    for (const lang of ['en', 'fr'] as const) {
      const c = localize(zaf, lang);
      expect(c.code).toBe('ZAF');
      expect(c.continent).toBe('Africa');
      expect(c.capitalLonLat).toEqual([28.227, -25.708]);
    }
  });

  it('produces a plain Country with no nested language objects', () => {
    expect(Object.keys(localize(zaf, 'fr')).sort()).toEqual([
      'altCapitals',
      'capital',
      'capitalLonLat',
      'code',
      'continent',
      'name',
    ]);
  });
});

function board(...scores: number[]): RunSummary[] {
  return scores
    .slice()
    .sort((a, b) => b - a)
    .map((score, i) => ({
      id: i + 1,
      mode: 'name' as const,
      playerName: `P${i}`,
      score,
      correctCount: 5,
      bestStreak: 2,
      finishedAt: '2026-08-24T10:00:00.000Z',
    }));
}

describe('qualifiesForLeaderboard', () => {
  it('accepts any positive score while the board has room', () => {
    expect(qualifiesForLeaderboard(1, [])).toBe(true);
    expect(qualifiesForLeaderboard(50, board(900, 800))).toBe(true);
  });

  it('rejects a zero score even on an empty board', () => {
    // A player who answered nothing correctly has not set a record.
    expect(qualifiesForLeaderboard(0, [])).toBe(false);
  });

  it('rejects a negative score', () => {
    expect(qualifiesForLeaderboard(-10, [])).toBe(false);
  });

  it('accepts a score beating the lowest once the board is full', () => {
    const full = board(1000, 900, 800, 700, 600, 500, 400, 300, 200, 100);
    expect(full).toHaveLength(LEADERBOARD_SIZE);
    expect(qualifiesForLeaderboard(101, full)).toBe(true);
  });

  it('rejects a score below the lowest on a full board', () => {
    const full = board(1000, 900, 800, 700, 600, 500, 400, 300, 200, 100);
    expect(qualifiesForLeaderboard(99, full)).toBe(false);
  });

  it('rejects a score merely tying the lowest on a full board', () => {
    // Strictly greater, so replaying the same score does not churn the board.
    const full = board(1000, 900, 800, 700, 600, 500, 400, 300, 200, 100);
    expect(qualifiesForLeaderboard(100, full)).toBe(false);
  });

  it('accepts a tie for the lowest while the board still has room', () => {
    expect(qualifiesForLeaderboard(100, board(100))).toBe(true);
  });

  it('does not depend on the board arriving sorted', () => {
    const unsorted = board(500, 100, 900).reverse();
    expect(qualifiesForLeaderboard(200, unsorted)).toBe(true);
  });

  it('treats an over-long board by its lowest kept entry', () => {
    const twelve = board(1200, 1100, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100);
    // Only the top 10 are kept, so the bar is the 10th score, not the 12th.
    expect(qualifiesForLeaderboard(350, twelve)).toBe(true);
    expect(qualifiesForLeaderboard(250, twelve)).toBe(false);
  });
});
