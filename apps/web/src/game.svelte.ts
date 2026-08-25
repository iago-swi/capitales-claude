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
  type LonLat,
  type Mode,
  type RunSummary,
} from '@capitales/core';
import { loadCountries, saveRun, topScores } from '@capitales/data';

export const QUESTION_COUNT = 10;
const REVEAL_MS = 1200;
/** Longer: a placement has a result to read, not just a right answer to see. */
const PLACE_REVEAL_MS = 2200;
const LANG_KEY = 'capitales.lang';
const MODE_KEY = 'capitales.mode';

/** Remembered language, or the browser's if it has never been chosen here. */
function initialLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  const saved = window.localStorage.getItem(LANG_KEY);
  if (saved === 'en' || saved === 'fr') return saved;
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/** Remembered mode, so a returning player is one click from playing. */
function initialMode(): Mode {
  if (typeof window === 'undefined') return 'name';
  const saved = window.localStorage.getItem(MODE_KEY);
  return saved === 'place' ? 'place' : 'name';
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
  let mode = $state<Mode>(initialMode());
  let now = $state(Date.now());
  let leaderboard = $state<RunSummary[]>([]);
  let qualifies = $state(false);
  let boardLoaded = $state(false);
  let playerName = $state('');
  let ambientIndex = $state(Math.floor(Math.random() * 1000));
  /** What the question just settled was worth, for the placement readout. */
  let lastPoints = $state(0);
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
      lastPoints = 0;
      revealUntil = now + (state.mode === 'place' ? PLACE_REVEAL_MS : REVEAL_MS);
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
      // Deal a run but do NOT start the clock: the machine rests in `ready`,
      // which is the title screen. Nothing is timed until the player says so.
      deal();
      void refreshBoard();
    } catch (error) {
      dispatch({
        type: 'FAIL',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Prepares a run and rests on the title screen. */
  function deal(): void {
    const seed = Math.floor(Math.random() * 2 ** 31);
    // Localise here, so question generation, distractors and answer matching
    // all operate in one language and never see the multilingual record.
    const pool = localizeAll(records, lang);
    dispatch({
      type: 'LOADED',
      questions: buildRun(pool, QUESTION_COUNT, mulberry32(seed)),
      mode,
    });
    qualifies = false;
    boardLoaded = false;
  }

  /** Starts the clock on the dealt run. */
  function startRun(): void {
    startedAt = new Date().toISOString();
    dispatch({ type: 'START', now: Date.now() });
  }

  /** Loads the board so the title screen can show a best score. */
  async function refreshBoard(): Promise<void> {
    try {
      leaderboard = await topScores(LEADERBOARD_SIZE, mode);
    } catch {
      leaderboard = [];
    }
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
      leaderboard = await topScores(LEADERBOARD_SIZE, mode);
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
    const before = state.score;
    dispatch({ type: 'ANSWER', optionIndex, now: at });
    lastPoints = state.score - before;
    revealUntil = at + REVEAL_MS;
  }

  /**
   * Drops the marker in `place` mode.
   *
   * The reveal is longer here than in naming: the player needs a moment to see
   * their marker, the real one, and the line between them before the map moves
   * on to another country.
   */
  function place(lonLat: LonLat, reachKm?: number): void {
    if (state.phase !== 'question') return;
    const at = Date.now();
    const before = state.score;
    dispatch({ type: 'PLACE', lonLat, now: at, reachKm });
    lastPoints = state.score - before;
    revealUntil = at + PLACE_REVEAL_MS;
  }

  async function submit(): Promise<void> {
    dispatch({ type: 'SUBMIT' });
    try {
      await saveRun({
        playerName: playerName.trim() || 'Anonymous',
        mode,
        score: state.score,
        correctCount: state.correctCount,
        bestStreak: state.bestStreak,
        questionCount: QUESTION_COUNT,
        startedAt,
        answers: state.answers,
      });
      leaderboard = await topScores(LEADERBOARD_SIZE, mode);
      qualifies = false;
      dispatch({ type: 'SUBMIT_OK' });
    } catch (error) {
      dispatch({
        type: 'SUBMIT_FAILED',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Back to the title screen with a fresh run dealt. */
  function restart(): void {
    dispatch({ type: 'RESTART' });
    deal();
    void refreshBoard();
  }

  /**
   * Switches language and starts a fresh run.
   *
   * Restarting is deliberate rather than lazy: swapping the labels mid-question
   * would change the four options under the player's cursor, and a run scored
   * half in one language and half in another is not one run.
   */
  /**
   * Switches mode and deals a fresh run.
   *
   * Same reasoning as the language: the two modes are answered differently, so
   * a run half-played in each is not one run. Only ever called from the title
   * screen, where nothing is in flight.
   */
  function setMode(next: Mode): void {
    if (next === mode) return;
    mode = next;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MODE_KEY, next);
    }
    dispatch({ type: 'RESTART' });
    if (records.length > 0) deal();
    void refreshBoard();
  }

  function setLang(next: Lang): void {
    if (next === lang) return;
    lang = next;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANG_KEY, next);
    }
    if (records.length > 0) {
      dispatch({ type: 'RESTART' });
      deal();
    }
  }

  return {
    get state() {
      return state;
    },
    get lang() {
      return lang;
    },
    get mode() {
      return mode;
    },
    get lastPoints() {
      return lastPoints;
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
    get countryCount() {
      return records.length;
    },
    /** Highest score on record, or null before anyone has filed one. */
    get bestScore() {
      return leaderboard[0] ?? null;
    },
    /** A country to show behind the title screen, reshuffled on each visit. */
    get ambient() {
      if (records.length === 0) return null;
      return records[ambientIndex % records.length] ?? null;
    },
    nextAmbient() {
      ambientIndex += 1;
    },
    get playerName() {
      return playerName;
    },
    set playerName(v: string) {
      playerName = v;
    },
    boot,
    startRun,
    pick,
    place,
    submit,
    restart,
    setLang,
    setMode,
  };
}
