/** A deterministic source of numbers in [0, 1). */
export type Rng = () => number;

/**
 * Mulberry32: a small, fast, well-distributed 32-bit PRNG.
 * Chosen over Math.random because a quiz has to be reproducible in tests.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates. Returns a new array; the input is not mutated. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** Up to n distinct items, drawn without replacement. */
export function sample<T>(rng: Rng, items: readonly T[], n: number): T[] {
  if (n <= 0) return [];
  return shuffle(rng, items).slice(0, n);
}
