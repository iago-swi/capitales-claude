import { describe, expect, it } from 'vitest';
import { CREDITS, nextCredit } from './credits.js';

describe('nextCredit', () => {
  it('walks forward and wraps round', () => {
    expect(nextCredit(0, 3)).toBe(1);
    expect(nextCredit(1, 3)).toBe(2);
    expect(nextCredit(2, 3)).toBe(0);
  });

  it('stays put when there is only one', () => {
    expect(nextCredit(0, 1)).toBe(0);
  });

  it('does not divide by zero on an empty list', () => {
    expect(nextCredit(0, 0)).toBe(0);
  });

  it('cycles the real list back to its start', () => {
    let i = 0;
    for (let n = 0; n < CREDITS.length; n++) i = nextCredit(i);
    expect(i).toBe(0);
  });
});

describe('the credits themselves', () => {
  it('carries a caption', () => {
    // French only on purpose: the captions run on puns that do not survive
    // translation. A missing one would show as an empty panel, not an error.
    for (const person of CREDITS) {
      expect(person.caption.trim(), person.name).not.toBe('');
    }
  });

  it('carries a portrait that is actually an image', () => {
    // Guards the generated module: if build-portraits.mjs is ever run against
    // a missing file, this is what notices before a build ships a blank disc.
    for (const person of CREDITS) {
      expect(person.photo, person.name).toMatch(/^data:image\/webp;base64,/);
      expect(person.photo.length, person.name).toBeGreaterThan(2000);
    }
  });

  it('names everyone, for the alt text and the dots', () => {
    for (const person of CREDITS) {
      expect(person.name.trim()).not.toBe('');
    }
  });

  it('says what each person did, and says something different each time', () => {
    // Three different jobs, so three different headings. A shared title would
    // need a sentence to say what "réalisé / motivé / codé" says in one word.
    for (const person of CREDITS) {
      expect(person.heading.trim(), person.name).not.toBe('');
    }
    expect(new Set(CREDITS.map((c) => c.heading)).size).toBe(CREDITS.length);
  });

});
