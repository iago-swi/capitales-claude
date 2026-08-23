/** A point in GeoJSON order: [longitude, latitude]. Never [lat, lon]. */
export type LonLat = [number, number];

export interface Country {
  /** Natural Earth ADM0_A3. Also the countries table primary key. */
  code: string;
  name: string;
  /** The one answer counted as correct. */
  capital: string;
  capitalLonLat: LonLat;
  /** Precomputed with d3-geo geoCentroid over this country's own geometry. */
  centroid: LonLat;
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
