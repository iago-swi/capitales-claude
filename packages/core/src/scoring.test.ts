import { describe, expect, it } from 'vitest';
import { multiplierFor, QUESTION_MS, scoreAnswer } from './scoring.js';

describe('multiplierFor', () => {
  it('starts at 1 for the first correct answer', () => {
    expect(multiplierFor(1)).toBe(1);
  });

  it('steps up by 0.25 per consecutive correct answer', () => {
    expect(multiplierFor(2)).toBe(1.25);
    expect(multiplierFor(3)).toBe(1.5);
    expect(multiplierFor(4)).toBe(1.75);
  });

  it('caps at 2 from the fifth onward', () => {
    expect(multiplierFor(5)).toBe(2);
    expect(multiplierFor(9)).toBe(2);
    expect(multiplierFor(100)).toBe(2);
  });

  it('never drops below 1, even for a zero or negative streak', () => {
    expect(multiplierFor(0)).toBe(1);
    expect(multiplierFor(-3)).toBe(1);
  });
});

describe('scoreAnswer', () => {
  it('scores 0 for a wrong answer regardless of speed or streak', () => {
    expect(scoreAnswer(false, QUESTION_MS, 5)).toBe(0);
    expect(scoreAnswer(false, 0, 1)).toBe(0);
  });

  it('scores 200 for an instant first correct answer', () => {
    expect(scoreAnswer(true, QUESTION_MS, 1)).toBe(200);
  });

  it('scores 100 for a correct answer at the buzzer', () => {
    expect(scoreAnswer(true, 0, 1)).toBe(100);
  });

  it('scores 150 for a correct answer at the halfway point', () => {
    expect(scoreAnswer(true, QUESTION_MS / 2, 1)).toBe(150);
  });

  it('applies the streak multiplier to base and bonus together', () => {
    // (100 + 100) * 1.25
    expect(scoreAnswer(true, QUESTION_MS, 2)).toBe(250);
    // (100 + 0) * 2
    expect(scoreAnswer(true, 0, 5)).toBe(200);
    // (100 + 100) * 2 — the maximum a single question can be worth
    expect(scoreAnswer(true, QUESTION_MS, 5)).toBe(400);
  });

  it('clamps remaining time that is out of range', () => {
    expect(scoreAnswer(true, -500, 1)).toBe(100);
    expect(scoreAnswer(true, QUESTION_MS * 3, 1)).toBe(200);
  });

  it('returns whole numbers', () => {
    for (let ms = 0; ms <= QUESTION_MS; ms += 137) {
      for (let streak = 1; streak <= 6; streak++) {
        expect(Number.isInteger(scoreAnswer(true, ms, streak))).toBe(true);
      }
    }
  });
});
