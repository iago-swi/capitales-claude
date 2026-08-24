import {
  buildRun,
  initialState,
  mulberry32,
  QUESTION_MS,
  reduce,
  remainingMs,
  type Country,
  type GameEvent,
  type GameState,
  type RunSummary,
} from '@capitales/core';
import { loadCountries, saveRun, topScores } from '@capitales/data';

export const QUESTION_COUNT = 10;
const REVEAL_MS = 1200;

/**
 * The entire framework boundary. `packages/core` stays framework-free; this is
 * the only file that knows Svelte exists.
 */
export function createGame() {
  let state = $state<GameState>(initialState());
  let countries = $state<Country[]>([]);
  let now = $state(Date.now());
  let leaderboard = $state<RunSummary[]>([]);
  let playerName = $state('Player');
  let startedAt = new Date().toISOString();

  /** When the current reveal should end. Set on entering `revealing`. */
  let revealUntil = 0;

  function dispatch(event: GameEvent): void {
    state = reduce(state, event);
  }

  // One interval drives both transitions the player does not trigger: a
  // question expiring, and a reveal finishing.
  //
  // Both live here on purpose. Scheduling the reveal from pick() alone left
  // the game permanently stuck whenever a question timed out instead of being
  // answered — nothing was left to dispatch REVEAL_DONE. One timer with one
  // advance path cannot drift out of sync with itself.
  const tick = setInterval(() => {
    now = Date.now();
    if (state.phase === 'question' && remainingMs(state, now) <= 0) {
      dispatch({ type: 'TIMEOUT', now });
      revealUntil = now + REVEAL_MS;
    } else if (state.phase === 'revealing' && now >= revealUntil) {
      dispatch({ type: 'REVEAL_DONE', now });
    }
  }, 100);

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => clearInterval(tick));
  }

  async function boot(): Promise<void> {
    dispatch({ type: 'LOAD' });
    try {
      countries = await loadCountries();
      start();
    } catch (error) {
      dispatch({
        type: 'FAIL',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function start(): void {
    const seed = Math.floor(Math.random() * 2 ** 31);
    dispatch({
      type: 'LOADED',
      questions: buildRun(countries, QUESTION_COUNT, mulberry32(seed)),
    });
    startedAt = new Date().toISOString();
    dispatch({ type: 'START', now: Date.now() });
  }

  function pick(optionIndex: number): void {
    if (state.phase !== 'question') return;
    const at = Date.now();
    dispatch({ type: 'ANSWER', optionIndex, now: at });
    revealUntil = at + REVEAL_MS;
  }

  async function submit(): Promise<void> {
    dispatch({ type: 'SUBMIT' });
    try {
      await saveRun({
        playerName,
        score: state.score,
        correctCount: state.correctCount,
        bestStreak: state.bestStreak,
        questionCount: QUESTION_COUNT,
        startedAt,
        answers: state.answers,
      });
      leaderboard = await topScores(10);
      dispatch({ type: 'SUBMIT_OK' });
    } catch (error) {
      dispatch({
        type: 'SUBMIT_FAILED',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function restart(): void {
    dispatch({ type: 'RESTART' });
    start();
  }

  return {
    get state() {
      return state;
    },
    get remaining() {
      return remainingMs(state, now);
    },
    get total() {
      return QUESTION_MS;
    },
    get leaderboard() {
      return leaderboard;
    },
    get playerName() {
      return playerName;
    },
    set playerName(v: string) {
      playerName = v;
    },
    boot,
    pick,
    submit,
    restart,
  };
}
