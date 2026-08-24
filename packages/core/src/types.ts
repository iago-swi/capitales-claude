/** A point in GeoJSON order: [longitude, latitude]. Never [lat, lon]. */
export type LonLat = [number, number];

/** The languages the game is playable in. */
export type Lang = 'en' | 'fr';

export const LANGS: readonly Lang[] = ['en', 'fr'];

/** A value that exists in every supported language. */
export type Localized<T> = Record<Lang, T>;

/**
 * A country as the API stores and returns it: every language at once.
 *
 * The game never consumes this directly. `localize()` collapses it to a
 * `Country` in one chosen language, which is what question generation and the
 * reducer work with. Keeping the split here means switching language is a
 * re-map of data already in memory, not a round trip.
 */
export interface CountryRecord {
  code: string;
  name: Localized<string>;
  capital: Localized<string>;
  altCapitals: Localized<string[]>;
  capitalLonLat: LonLat;
  continent: string;
}

/** One country, in one language. The shape the game logic sees. */
export interface Country {
  /** Natural Earth ADM0_A3. Also the countries table primary key. */
  code: string;
  name: string;
  /** The one answer counted as correct. */
  capital: string;
  capitalLonLat: LonLat;
  continent: string;
  /** Other names also accepted if chosen, e.g. Cape Town for South Africa. */
  altCapitals: string[];
}

/** One answered question within a run. */
export interface AnswerRecord {
  code: string;
  /** The city the player picked, or null on a timeout. */
  chosen: string | null;
  correct: boolean;
  ms: number;
}

/** One finished game, as POSTed to the API. */
export interface RunInput {
  playerName: string;
  score: number;
  correctCount: number;
  bestStreak: number;
  questionCount: number;
  /** ISO 8601. */
  startedAt: string;
  answers: AnswerRecord[];
}

/** One leaderboard row, as returned by the API. */
export interface RunSummary {
  id: number;
  playerName: string;
  score: number;
  correctCount: number;
  bestStreak: number;
  /** ISO 8601. */
  finishedAt: string;
}
