import type { AnswerRecord, LonLat, Mode } from './types.js';
import { distanceKm, isCloseEnough, scorePlacement } from './placement.js';
import type { Question } from './questions.js';
import { isCorrect } from './questions.js';
import { QUESTION_MS, scoreAnswer } from './scoring.js';

export type Phase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'question'
  | 'revealing'
  | 'finished'
  | 'submitting'
  | 'leaderboard'
  | 'error';

export interface GameState {
  phase: Phase;
  mode: Mode;
  questions: Question[];
  index: number;
  /** Timestamp the current question started. Set from events, never Date.now(). */
  questionStartedAt: number;
  chosenIndex: number | null;
  /** Where the marker was dropped this question, in `place` mode. */
  placed: LonLat | null;
  /** How far that drop was, in kilometres. Null until something is placed. */
  placedOffKm: number | null;
  score: number;
  streak: number;
  bestStreak: number;
  correctCount: number;
  answers: AnswerRecord[];
  error: string | null;
}

export type GameEvent =
  | { type: 'LOAD' }
  | { type: 'LOADED'; questions: Question[]; mode?: Mode }
  | { type: 'START'; now: number }
  | { type: 'ANSWER'; optionIndex: number; now: number }
  | { type: 'PLACE'; lonLat: LonLat; now: number; radiusKm?: number }
  | { type: 'TIMEOUT'; now: number }
  | { type: 'REVEAL_DONE'; now: number }
  | { type: 'SUBMIT' }
  | { type: 'SUBMIT_OK' }
  | { type: 'SUBMIT_FAILED'; reason: string }
  | { type: 'RESTART' }
  | { type: 'FAIL'; reason: string };

export function initialState(): GameState {
  return {
    phase: 'idle',
    mode: 'name',
    questions: [],
    index: 0,
    questionStartedAt: 0,
    chosenIndex: null,
    placed: null,
    placedOffKm: null,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correctCount: 0,
    answers: [],
    error: null,
  };
}

/**
 * Milliseconds left on the current question.
 *
 * This is a derived value on purpose. Routing every countdown tick through the
 * reducer would mean 15 state updates per question and a re-render storm; the
 * UI computes this from questionStartedAt instead and only dispatches TIMEOUT
 * when it actually reaches zero.
 */
export function remainingMs(
  state: GameState,
  now: number,
  totalMs: number = QUESTION_MS,
): number {
  if (state.phase !== 'question') return 0;
  return Math.max(0, totalMs - (now - state.questionStartedAt));
}

/** Shared handling for both an explicit answer and a timeout. */
/**
 * Shared tail of both modes: bank the points, advance the streak, record the
 * answer. Only the verdict and the points differ between naming and placing,
 * so only those are computed by the callers.
 */
function record(
  state: GameState,
  now: number,
  correct: boolean,
  points: number,
  answer: Omit<AnswerRecord, 'correct' | 'ms'>,
): GameState {
  const elapsed = Math.max(0, now - state.questionStartedAt);
  const streak = correct ? state.streak + 1 : 0;

  return {
    ...state,
    phase: 'revealing',
    score: state.score + points,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    correctCount: state.correctCount + (correct ? 1 : 0),
    answers: [...state.answers, { ...answer, correct, ms: elapsed }],
  };
}

function settle(
  state: GameState,
  chosenIndex: number | null,
  now: number,
): GameState {
  const question = state.questions[state.index];
  if (!question) return state;

  const chosen =
    chosenIndex === null ? null : (question.options[chosenIndex] ?? null);
  const correct = chosen !== null && isCorrect(question, chosen);

  const elapsed = now - state.questionStartedAt;
  const remaining = Math.max(0, QUESTION_MS - elapsed);
  const streak = correct ? state.streak + 1 : 0;

  return {
    ...record(state, now, correct, scoreAnswer(correct, remaining, streak), {
      code: question.country.code,
      chosen,
    }),
    chosenIndex,
  };
}

/**
 * Settles a placed marker.
 *
 * `lonLat` of null is a timeout with nothing dropped, which scores zero and
 * breaks the streak exactly like a wrong name.
 */
function settlePlacement(
  state: GameState,
  lonLat: LonLat | null,
  now: number,
  radiusKm?: number,
): GameState {
  const question = state.questions[state.index];
  if (!question) return state;

  const truth = question.country.capitalLonLat;
  const offKm = lonLat === null ? null : distanceKm(lonLat, truth);
  // Scored against the country's own size: 200 km from Bern is a miss, 200 km
  // from Ottawa is a good guess.
  const correct = isCloseEnough(offKm, radiusKm);

  const elapsed = now - state.questionStartedAt;
  const remaining = Math.max(0, QUESTION_MS - elapsed);
  const streak = correct ? state.streak + 1 : 0;

  return {
    ...record(state, now, correct, scorePlacement(offKm, remaining, streak, radiusKm), {
      code: question.country.code,
      // The city was shown, not chosen — recording it keeps the answer row
      // readable next to a naming run.
      chosen: question.country.capital,
      ...(lonLat === null ? {} : { placed: lonLat }),
      ...(offKm === null ? {} : { offKm }),
    }),
    placed: lonLat,
    placedOffKm: offKm,
  };
}

export function reduce(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'LOAD':
      return { ...state, phase: 'loading', error: null };

    case 'LOADED':
      return {
        ...state,
        phase: 'ready',
        questions: event.questions,
        mode: event.mode ?? state.mode,
      };

    case 'START':
      if (state.questions.length === 0) return state;
      return {
        ...state,
        phase: 'question',
        index: 0,
        questionStartedAt: event.now,
        chosenIndex: null,
        placed: null,
        placedOffKm: null,
      };

    case 'ANSWER':
      if (state.phase !== 'question' || state.mode !== 'name') return state;
      return settle(state, event.optionIndex, event.now);

    case 'PLACE':
      if (state.phase !== 'question' || state.mode !== 'place') return state;
      return settlePlacement(state, event.lonLat, event.now, event.radiusKm);

    case 'TIMEOUT':
      if (state.phase !== 'question') return state;
      return state.mode === 'place'
        ? settlePlacement(state, null, event.now)
        : settle(state, null, event.now);

    case 'REVEAL_DONE': {
      if (state.phase !== 'revealing') return state;
      const next = state.index + 1;
      if (next >= state.questions.length) {
        return { ...state, phase: 'finished' };
      }
      return {
        ...state,
        phase: 'question',
        index: next,
        questionStartedAt: event.now,
        chosenIndex: null,
        placed: null,
        placedOffKm: null,
      };
    }

    case 'SUBMIT':
      if (state.phase !== 'finished') return state;
      return { ...state, phase: 'submitting', error: null };

    case 'SUBMIT_OK':
      return { ...state, phase: 'leaderboard' };

    case 'SUBMIT_FAILED':
      // Back to finished, not error: the player's score stays on screen and
      // stays retryable. A finished run is never lost to a write failure.
      return { ...state, phase: 'finished', error: event.reason };

    case 'RESTART':
      // The mode is a preference, not run state: restarting keeps it.
      return { ...initialState(), mode: state.mode };

    case 'FAIL':
      return { ...state, phase: 'error', error: event.reason };
  }
}
