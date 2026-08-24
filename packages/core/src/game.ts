import type { AnswerRecord } from './types.js';
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
  questions: Question[];
  index: number;
  /** Timestamp the current question started. Set from events, never Date.now(). */
  questionStartedAt: number;
  chosenIndex: number | null;
  score: number;
  streak: number;
  bestStreak: number;
  correctCount: number;
  answers: AnswerRecord[];
  error: string | null;
}

export type GameEvent =
  | { type: 'LOAD' }
  | { type: 'LOADED'; questions: Question[] }
  | { type: 'START'; now: number }
  | { type: 'ANSWER'; optionIndex: number; now: number }
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
    questions: [],
    index: 0,
    questionStartedAt: 0,
    chosenIndex: null,
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
    ...state,
    phase: 'revealing',
    chosenIndex,
    score: state.score + scoreAnswer(correct, remaining, streak),
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    correctCount: state.correctCount + (correct ? 1 : 0),
    answers: [
      ...state.answers,
      {
        code: question.country.code,
        chosen,
        correct,
        ms: Math.max(0, elapsed),
      },
    ],
  };
}

export function reduce(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'LOAD':
      return { ...state, phase: 'loading', error: null };

    case 'LOADED':
      return { ...state, phase: 'ready', questions: event.questions };

    case 'START':
      if (state.questions.length === 0) return state;
      return {
        ...state,
        phase: 'question',
        index: 0,
        questionStartedAt: event.now,
        chosenIndex: null,
      };

    case 'ANSWER':
      if (state.phase !== 'question') return state;
      return settle(state, event.optionIndex, event.now);

    case 'TIMEOUT':
      if (state.phase !== 'question') return state;
      return settle(state, null, event.now);

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
      return initialState();

    case 'FAIL':
      return { ...state, phase: 'error', error: event.reason };
  }
}
