import { describe, expect, it } from 'vitest';
import {
  EASTER_TAPS,
  EASTER_WINDOW_MS,
  isUnlocked,
  nextTapCount,
  shouldHint,
  tapsRemaining,
} from './easter.js';

describe('nextTapCount', () => {
  it('starts a run on the first press of a session', () => {
    expect(nextTapCount(0, 1000, null)).toBe(1);
  });

  it('counts on while presses keep coming', () => {
    expect(nextTapCount(1, 1200, 1000)).toBe(2);
    expect(nextTapCount(5, 1200, 1000)).toBe(6);
  });

  it('starts again once the run has gone stale', () => {
    // A hesitant player starts over rather than being told nothing happened.
    expect(nextTapCount(4, 1000 + EASTER_WINDOW_MS + 1, 1000)).toBe(1);
  });

  it('keeps a press that lands exactly on the window', () => {
    expect(nextTapCount(4, 1000 + EASTER_WINDOW_MS, 1000)).toBe(5);
  });

  it('opens on the seventh press and not the sixth', () => {
    let count = 0;
    let last: number | null = null;
    for (let i = 0; i < EASTER_TAPS - 1; i++) {
      const now = 1000 + i * 300;
      count = nextTapCount(count, now, last);
      last = now;
      expect(isUnlocked(count)).toBe(false);
    }
    count = nextTapCount(count, 1000 + EASTER_TAPS * 300, last);
    expect(isUnlocked(count)).toBe(true);
  });

  it('cannot be reached by presses spread across a session', () => {
    // The whole point of the window: idle clicking on the logo over minutes
    // must never add up to the secret.
    let count = 0;
    let last: number | null = null;
    for (let i = 0; i < 40; i++) {
      const now = i * (EASTER_WINDOW_MS + 500);
      count = nextTapCount(count, now, last);
      last = now;
      expect(count).toBe(1);
    }
  });
});

describe('tapsRemaining', () => {
  it('counts down to zero and stops there', () => {
    expect(tapsRemaining(0)).toBe(EASTER_TAPS);
    expect(tapsRemaining(EASTER_TAPS - 1)).toBe(1);
    expect(tapsRemaining(EASTER_TAPS)).toBe(0);
    expect(tapsRemaining(EASTER_TAPS + 5)).toBe(0);
  });
});

describe('shouldHint', () => {
  it('says nothing early, so the secret stays one', () => {
    expect(shouldHint(1)).toBe(false);
    expect(shouldHint(2)).toBe(false);
  });

  it('hints once the run is clearly deliberate', () => {
    expect(shouldHint(4)).toBe(true);
    expect(shouldHint(EASTER_TAPS - 1)).toBe(true);
  });

  it('stops hinting once it is open', () => {
    expect(shouldHint(EASTER_TAPS)).toBe(false);
  });
});
