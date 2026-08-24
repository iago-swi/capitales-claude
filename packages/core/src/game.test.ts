import { describe, expect, it } from 'vitest';
import type { Country } from './types.js';
import { mulberry32 } from './rng.js';
import { buildRun } from './questions.js';
import { QUESTION_MS } from './scoring.js';
import { initialState, reduce, remainingMs } from './game.js';
import type { GameState } from './game.js';

function country(code: string, capital: string): Country {
  return {
    code,
    name: code,
    capital,
    capitalLonLat: [0, 0],
    centroid: [0, 0],
    continent: 'Europe',
    altCapitals: [],
  };
}

const pool = [
  country('FRA', 'Paris'),
  country('DEU', 'Berlin'),
  country('ESP', 'Madrid'),
  country('ITA', 'Rome'),
  country('PRT', 'Lisbon'),
  country('AUT', 'Vienna'),
];

const T0 = 1_000_000;

function started(count = 3): GameState {
  const questions = buildRun(pool, count, mulberry32(1));
  const s = reduce(initialState(), { type: 'LOADED', questions });
  return reduce(s, { type: 'START', now: T0 });
}

/** Answers the current question correctly at `now`. */
function answerCorrectly(s: GameState, now: number): GameState {
  const q = s.questions[s.index]!;
  return reduce(s, { type: 'ANSWER', optionIndex: q.correctIndex, now });
}

/** Answers the current question wrongly at `now`. */
function answerWrongly(s: GameState, now: number): GameState {
  const q = s.questions[s.index]!;
  const wrong = q.options.findIndex((_, i) => i !== q.correctIndex);
  return reduce(s, { type: 'ANSWER', optionIndex: wrong, now });
}

describe('initialState', () => {
  it('starts idle with a zero score', () => {
    const s = initialState();
    expect(s.phase).toBe('idle');
    expect(s.score).toBe(0);
    expect(s.questions).toEqual([]);
  });
});

describe('reduce', () => {
  it('moves idle -> loading -> ready -> question', () => {
    let s = reduce(initialState(), { type: 'LOAD' });
    expect(s.phase).toBe('loading');
    s = reduce(s, { type: 'LOADED', questions: buildRun(pool, 3, mulberry32(1)) });
    expect(s.phase).toBe('ready');
    s = reduce(s, { type: 'START', now: T0 });
    expect(s.phase).toBe('question');
    expect(s.index).toBe(0);
    expect(s.questionStartedAt).toBe(T0);
  });

  it('scores a correct answer and enters revealing', () => {
    const s = answerCorrectly(started(), T0);
    expect(s.phase).toBe('revealing');
    expect(s.score).toBe(200); // instant, first of streak
    expect(s.streak).toBe(1);
    expect(s.correctCount).toBe(1);
  });

  it('scores 0 for a wrong answer and resets the streak', () => {
    let s = answerCorrectly(started(), T0);
    s = reduce(s, { type: 'REVEAL_DONE', now: T0 + 2000 });
    const before = s.score;
    s = answerWrongly(s, T0 + 2000);
    expect(s.score).toBe(before);
    expect(s.streak).toBe(0);
    expect(s.correctCount).toBe(1);
  });

  it('treats a timeout as a wrong answer', () => {
    const s = reduce(started(), { type: 'TIMEOUT', now: T0 + QUESTION_MS });
    expect(s.phase).toBe('revealing');
    expect(s.score).toBe(0);
    expect(s.streak).toBe(0);
    expect(s.chosenIndex).toBeNull();
    expect(s.answers[0]?.correct).toBe(false);
  });

  it('advances to the next question on REVEAL_DONE', () => {
    let s = answerCorrectly(started(), T0);
    s = reduce(s, { type: 'REVEAL_DONE', now: T0 + 1200 });
    expect(s.phase).toBe('question');
    expect(s.index).toBe(1);
    expect(s.questionStartedAt).toBe(T0 + 1200);
    expect(s.chosenIndex).toBeNull();
  });

  it('finishes after the last question', () => {
    let s = started(2);
    s = answerCorrectly(s, T0);
    s = reduce(s, { type: 'REVEAL_DONE', now: T0 + 1000 });
    s = answerCorrectly(s, T0 + 1000);
    s = reduce(s, { type: 'REVEAL_DONE', now: T0 + 2000 });
    expect(s.phase).toBe('finished');
    expect(s.index).toBe(1);
    expect(s.answers).toHaveLength(2);
  });

  it('tracks the best streak even after it breaks', () => {
    let s = started(3);
    s = answerCorrectly(s, T0);
    s = reduce(s, { type: 'REVEAL_DONE', now: T0 + 1000 });
    s = answerCorrectly(s, T0 + 1000);
    s = reduce(s, { type: 'REVEAL_DONE', now: T0 + 2000 });
    expect(s.bestStreak).toBe(2);
    s = answerWrongly(s, T0 + 2000);
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(2);
  });

  it('records elapsed milliseconds per answer', () => {
    const s = answerCorrectly(started(), T0 + 4321);
    expect(s.answers[0]?.ms).toBe(4321);
  });

  it('ignores a second answer to the same question', () => {
    let s = answerCorrectly(started(), T0);
    const after = s.score;
    s = answerCorrectly(s, T0);
    expect(s.score).toBe(after);
    expect(s.answers).toHaveLength(1);
  });

  it('ignores ANSWER outside the question phase', () => {
    const s = reduce(initialState(), { type: 'ANSWER', optionIndex: 0, now: T0 });
    expect(s.phase).toBe('idle');
    expect(s.answers).toHaveLength(0);
  });

  it('moves finished -> submitting -> leaderboard', () => {
    let s = started(1);
    s = answerCorrectly(s, T0);
    s = reduce(s, { type: 'REVEAL_DONE', now: T0 + 1000 });
    expect(s.phase).toBe('finished');
    s = reduce(s, { type: 'SUBMIT' });
    expect(s.phase).toBe('submitting');
    s = reduce(s, { type: 'SUBMIT_OK' });
    expect(s.phase).toBe('leaderboard');
  });

  it('returns to finished with an error when submitting fails', () => {
    let s = started(1);
    s = answerCorrectly(s, T0);
    s = reduce(s, { type: 'REVEAL_DONE', now: T0 + 1000 });
    s = reduce(s, { type: 'SUBMIT' });
    s = reduce(s, { type: 'SUBMIT_FAILED', reason: 'offline' });
    // The score must survive a failed write.
    expect(s.phase).toBe('finished');
    expect(s.error).toBe('offline');
    expect(s.score).toBe(200);
  });

  it('clears the error on a retry', () => {
    let s = started(1);
    s = answerCorrectly(s, T0);
    s = reduce(s, { type: 'REVEAL_DONE', now: T0 + 1000 });
    s = reduce(s, { type: 'SUBMIT' });
    s = reduce(s, { type: 'SUBMIT_FAILED', reason: 'offline' });
    s = reduce(s, { type: 'SUBMIT' });
    expect(s.error).toBeNull();
  });

  it('enters the error phase on FAIL', () => {
    const s = reduce(initialState(), { type: 'FAIL', reason: 'no API server' });
    expect(s.phase).toBe('error');
    expect(s.error).toBe('no API server');
  });

  it('resets to idle on RESTART', () => {
    let s = answerCorrectly(started(), T0);
    s = reduce(s, { type: 'RESTART' });
    expect(s).toEqual(initialState());
  });

  it('never mutates the state it is given', () => {
    const before = started();
    const snapshot = structuredClone(before);
    answerCorrectly(before, T0);
    expect(before).toEqual(snapshot);
  });

  it('never reads the clock itself', () => {
    // Two reducers fed identical events must agree, whatever the wall clock did.
    const a = answerCorrectly(started(), T0 + 500);
    const b = answerCorrectly(started(), T0 + 500);
    expect(a.score).toBe(b.score);
    expect(a.answers).toEqual(b.answers);
  });
});

describe('remainingMs', () => {
  it('is the full duration at the moment a question starts', () => {
    expect(remainingMs(started(), T0)).toBe(QUESTION_MS);
  });

  it('counts down', () => {
    expect(remainingMs(started(), T0 + 5000)).toBe(QUESTION_MS - 5000);
  });

  it('floors at zero rather than going negative', () => {
    expect(remainingMs(started(), T0 + QUESTION_MS * 2)).toBe(0);
  });

  it('is zero outside the question phase', () => {
    expect(remainingMs(initialState(), T0)).toBe(0);
  });
});
