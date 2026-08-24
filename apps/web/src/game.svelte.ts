import {
  buildRun,
  initialState,
  LEADERBOARD_SIZE,
  localizeAll,
  mulberry32,
  qualifiesForLeaderboard,
  QUESTION_MS,
  reduce,
  remainingMs,
  type CountryRecord,
  type GameEvent,
  type GameState,
  type Lang,
  type RunSummary,
} from '@capitales/core';
import { loadCountries, saveRun, topScores } from '@capitales/data';

export const QUESTION_COUNT = 10;
const REVEAL_MS = 1200;
const LANG_KEY = 'capitales.lang';

/** Remembered language, or the browser's if it has never been chosen here. */
function initialLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  const saved = window.localStorage.getItem(LANG_KEY);
  if (saved === 'en' || saved === 'fr') return saved;
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/**
 * The entire framework boundary. `packages/core` stays framework-free; this is
 * the only file that knows Svelte exists.
 */
export function createGame() {
  let state = $state<GameState>(initialState());
  /** Every language at once, as the API returns it. */
  let records = $state<CountryRecord[]>([]);
  let lang = $state<Lang>(initialLang());
  let now = $state(Date.now());
  let leaderboard = $state<RunSummary[]>([]);
  let qualifies = $state(false);
  let boardLoaded = $state(false);
  let playerName = $state('');
  let startedAt = new Date().toISOString();

  /** When the current reveal should end. Set on entering `revealing`. */
  let revealUntil = 0;

  /** Applies an event and returns the resulting state, so callers can branch
   * on where the machine landed without re-reading a narrowed `state`. */
  function dispatch(event: GameEvent): GameState {
    state = reduce(state, event);
    return state;
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
      const next = dispatch({ type: 'REVEAL_DONE', now });
      if (next.phase === 'finished') void checkHighScore();
    }
  }, 100);

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => clearInterval(tick));
  }

  async function boot(): Promise<void> {
    dispatch({ type: 'LOAD' });
    try {
      records = await loadCountries();
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
    // Localise here, so question generation, distractors and answer matching
    // all operate in one language and never see the multilingual record.
    const pool = localizeAll(records, lang);
    dispatch({
      type: 'LOADED',
      questions: buildRun(pool, QUESTION_COUNT, mulberry32(seed)),
    });
    startedAt = new Date().toISOString();
    qualifies = false;
    boardLoaded = false;
    dispatch({ type: 'START', now: Date.now() });
  }

  /**
   * Decides whether the finished run earned a place before offering the name
   * field, so entering a name means something.
   *
   * A failure here must not cost the player their score, so an unreachable
   * server simply leaves the board empty and the run unsaved.
   */
  async function checkHighScore(): Promise<void> {
    try {
      leaderboard = await topScores(LEADERBOARD_SIZE);
      qualifies = qualifiesForLeaderboard(state.score, leaderboard);
    } catch {
      leaderboard = [];
      qualifies = false;
    } finally {
      boardLoaded = true;
    }
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
        playerName: playerName.trim() || 'Anonymous',
        score: state.score,
        correctCount: state.correctCount,
        bestStreak: state.bestStreak,
        questionCount: QUESTION_COUNT,
        startedAt,
        answers: state.answers,
      });
      leaderboard = await topScores(LEADERBOARD_SIZE);
      qualifies = false;
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

  /**
   * Switches language and starts a fresh run.
   *
   * Restarting is deliberate rather than lazy: swapping the labels mid-question
   * would change the four options under the player's cursor, and a run scored
   * half in one language and half in another is not one run.
   */
  function setLang(next: Lang): void {
    if (next === lang) return;
    lang = next;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANG_KEY, next);
    }
    if (records.length > 0) {
      dispatch({ type: 'RESTART' });
      start();
    }
  }

  return {
    get state() {
      return state;
    },
    get lang() {
      return lang;
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
    get qualifies() {
      return qualifies;
    },
    get boardLoaded() {
      return boardLoaded;
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
    setLang,
  };
}
