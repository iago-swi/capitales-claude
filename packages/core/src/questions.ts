import type { Rng } from './rng.js';
import { sample, shuffle } from './rng.js';
import type { Country } from './types.js';

export const OPTION_COUNT = 4;

export interface Question {
  country: Country;
  /** Four capital names, shuffled. */
  options: string[];
  /** Index into options of the canonical correct answer. */
  correctIndex: number;
}

/**
 * Builds one question.
 *
 * Distractors come from the same continent where possible. That is a deliberate
 * difficulty choice: "Paris / Berlin / Madrid / Rome" is a real question, while
 * "Paris / Ulaanbaatar / Suva / Asuncion" gives the answer away.
 */
export function buildQuestion(
  country: Country,
  pool: readonly Country[],
  rng: Rng,
): Question {
  // A country's own alternate capitals must never appear as a wrong answer.
  const forbidden = new Set([country.capital, ...country.altCapitals]);

  const eligible = pool.filter(
    (c) => c.code !== country.code && !forbidden.has(c.capital),
  );

  const sameContinent = eligible.filter(
    (c) => c.continent === country.continent,
  );

  const needed = OPTION_COUNT - 1;
  const distractors = sample(rng, sameContinent, needed);

  if (distractors.length < needed) {
    const taken = new Set(distractors.map((c) => c.code));
    const rest = eligible.filter((c) => !taken.has(c.code));
    distractors.push(...sample(rng, rest, needed - distractors.length));
  }

  if (distractors.length < needed) {
    throw new Error(
      `pool must contain at least ${OPTION_COUNT} countries with distinct ` +
        `capitals; got ${distractors.length + 1} usable for ${country.code}`,
    );
  }

  const options = shuffle(rng, [
    country.capital,
    ...distractors.map((c) => c.capital),
  ]);

  return {
    country,
    options,
    correctIndex: options.indexOf(country.capital),
  };
}

/** Builds a full run of `count` questions about distinct countries. */
export function buildRun(
  pool: readonly Country[],
  count: number,
  rng: Rng,
): Question[] {
  if (count > pool.length) {
    throw new Error(
      `asked for ${count} questions but the pool has only ${pool.length} countries`,
    );
  }
  return sample(rng, pool, count).map((c) => buildQuestion(c, pool, rng));
}

/**
 * Whether a chosen city counts as correct. Accepts the canonical capital and
 * any alternate the data marks acceptable, e.g. Cape Town for South Africa.
 */
export function isCorrect(question: Question, chosen: string): boolean {
  return (
    chosen === question.country.capital ||
    question.country.altCapitals.includes(chosen)
  );
}
