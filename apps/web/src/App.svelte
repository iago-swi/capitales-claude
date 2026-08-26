<script lang="ts">
  import { onMount } from 'svelte';
  import type { Topology } from 'topojson-specification';
  import { buildAtlas, fitCountry } from '@capitales/geo';
  import {
    averageOffKm,
    correctDistanceFor,
    isCloseEnough,
    isCorrect,
    PLACE_FULL_KM,
    t,
    type MessageKey,
    type Mode,
  } from '@capitales/core';
  import {
    AnswerButton,
    CountryMap,
    LanguageToggle,
    ModeToggle,
    PlacementResult,
    Scoreboard,
    Timer,
    Wordmark,
  } from '@capitales/ui';
  import topo from '../../../packages/data/countries.topo.json';
  import { createGame, QUESTION_COUNT } from './game.svelte.js';

  const atlas = buildAtlas(topo as unknown as Topology);
  const BOX = { width: 720, height: 560 };
  const HERO = { width: 420, height: 300, padding: 30 };

  const game = createGame();

  let msg = $derived((key: MessageKey) => t(game.lang, key));
  let modeLabel = $derived((m: Mode) =>
    m === 'place' ? msg('modePlace') : msg('modeName'),
  );
  let question = $derived(game.state.questions[game.state.index]);

  let fitted = $derived.by(() => {
    if (!question) return null;
    const f = atlas.get(question.country.code);
    if (!f) return null;
    return fitCountry(f, question.country.capitalLonLat, BOX);
  });

  /** The title screen's outline: a real country, projected by the real code. */
  let hero = $derived.by(() => {
    const record = game.ambient;
    if (!record) return null;
    const f = atlas.get(record.code);
    if (!f) return null;
    return fitCountry(f, record.capitalLonLat, HERO);
  });

  /** Survey-style coordinate readout for the marker currently on screen. */
  function readout(lonLat: [number, number] | undefined): string {
    if (!lonLat) return '';
    const [lon, lat] = lonLat;
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(2)}°${ns} · ${Math.abs(lon).toFixed(2)}°${ew}`;
  }

  let placing = $derived(game.state.mode === 'place');
  let averageOff = $derived(averageOffKm(game.state.answers));
  let revealing = $derived(game.state.phase === 'revealing');

  /**
   * The player's marker in pixels.
   *
   * Re-projected from the stored coordinate rather than kept as the click
   * position, so it stays correct if the frame is ever resized between the drop
   * and the reveal.
   */
  let guessXY = $derived.by(() => {
    const placed = game.state.placed;
    if (!fitted || !placed) return null;
    return fitted.project(placed);
  });

  /**
   * Pixel radius of the on-target zone, for drawing it on the reveal.
   *
   * The results screen counts drops that landed "on target", and the phrase
   * named nothing the player could see until this circle existed. Derived from
   * the same function the scoring uses, so the drawing cannot drift from the
   * rule it illustrates.
   */
  let targetPx = $derived.by(() => {
    if (!fitted) return null;
    return fitted.radiusPx(correctDistanceFor(fitted.reachKm));
  });

  function optionState(i: number): 'idle' | 'correct' | 'wrong' | 'muted' {
    if (game.state.phase !== 'revealing' || !question) return 'idle';
    if (isCorrect(question, question.options[i] ?? '')) return 'correct';
    if (game.state.chosenIndex === i) return 'wrong';
    return 'muted';
  }

  /** Is this a touch device? Only used to word the hint correctly. */
  let coarse = $state(false);

  /**
   * Turns a click on the map into a coordinate and settles the question.
   *
   * The pixel goes back through the very projection that drew the outline, so
   * the guess is measured in the same space it was made in.
   */
  function dropMarker(x: number, y: number): void {
    if (!fitted) return;
    const lonLat = fitted.unproject(x, y);
    if (!lonLat) return;
    // The size of the landmass actually on screen decides how forgiving the
    // scoring is for this question.
    game.place(lonLat, fitted.reachKm);
  }

  function onKey(event: KeyboardEvent) {
    if (game.state.phase === 'ready' && event.key === 'Enter') {
      game.startRun();
      return;
    }
    if (game.state.phase !== 'question' || placing) return;
    // Both the printed letter and its position on the number row.
    const letter = 'abcd'.indexOf(event.key.toLowerCase());
    const digit = Number(event.key) - 1;
    const i = letter >= 0 ? letter : digit;
    if (i >= 0 && i < 4) game.pick(i);
  }

  /**
   * The high-score board, reachable from the title rather than only after a
   * run. Local UI state rather than a game phase: which screen you are reading
   * is not part of the rules, and the reducer has enough to do.
   */
  let showBoard = $state(false);
  /** Second press required before anything is erased. */
  let confirmingClear = $state(false);
  let clearing = $state(false);

  async function doClear(): Promise<void> {
    clearing = true;
    await game.clearBoard();
    clearing = false;
    confirmingClear = false;
  }

  function openBoard(): void {
    confirmingClear = false;
    showBoard = true;
    void game.refreshBoard();
  }

  let isOver = $derived(
    game.state.phase === 'finished' ||
      game.state.phase === 'submitting' ||
      game.state.phase === 'leaderboard',
  );

  onMount(() => {
    coarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    void game.boot();
    // Slowly leaf through the atlas behind the title screen.
    const rotate = setInterval(() => {
      if (game.state.phase === 'ready') game.nextAmbient();
    }, 4200);
    return () => clearInterval(rotate);
  });
</script>

<svelte:window onkeydown={onKey} />

<div class="frame">
  <header class="bar">
    <Wordmark label={msg('wordmark')} />

    {#if game.state.phase === 'question' || game.state.phase === 'revealing'}
      <span class="counter mono">
        {msg('survey')}
        {game.state.index + 1} / {QUESTION_COUNT}
      </span>
      <Scoreboard
        score={game.state.score}
        streak={game.state.streak}
        label={msg('score')}
      />
    {:else}
      <span></span>
      <span></span>
    {/if}

    <LanguageToggle lang={game.lang} onchange={(l) => game.setLang(l)} />
  </header>

  <div class="rule"></div>

  <main>
    {#if game.state.phase === 'loading' || game.state.phase === 'idle'}
      <p class="centred mono">{msg('loading')}</p>
    {:else if game.state.phase === 'error'}
      <div class="centred fault">
        <p class="mono">{msg('cannotStart')}</p>
        <p class="fault-detail">{game.state.error}</p>
      </div>

      <!-- High scores, reached from the footer -->
    {:else if game.state.phase === 'ready' && showBoard}
      <section class="title board-page">
        <p class="eyebrow mono">{msg('highScores')} · {modeLabel(game.mode)}</p>

        {#if game.leaderboard.length === 0}
          <p class="mono empty-board">{msg('noScoresYet')}</p>
        {:else}
          <ol class="board-list" class:split={game.leaderboard.length > 5}>
            {#each game.leaderboard as row, i (row.id)}
              <li>
                <span class="rank mono">{String(i + 1).padStart(2, '0')}</span>
                <span class="who">{row.playerName}</span>
                <span class="pts">{row.score}</span>
              </li>
            {/each}
          </ol>
        {/if}

        {#if confirmingClear}
          <!-- Erasing is the one thing here that cannot be taken back, so it
               costs a second press and says plainly what it does. -->
          <p class="confirm-ask mono">{msg('clearListConfirm')}</p>
          <div class="board-actions">
            <button class="ghost" onclick={() => (confirmingClear = false)}>
              {msg('clearListCancel')}
            </button>
            <button class="danger" disabled={clearing} onclick={doClear}>
              {msg('clearList')}
            </button>
          </div>
        {:else}
          <div class="board-actions">
            <button class="ghost" onclick={() => (showBoard = false)}>
              {msg('back')}
            </button>
            {#if game.leaderboard.length > 0}
              <button class="ghost" onclick={() => (confirmingClear = true)}>
                {msg('clearList')}
              </button>
            {/if}
          </div>
        {/if}
      </section>

      <!-- Title screen -->
    {:else if game.state.phase === 'ready'}
      <section class="title">
        <div class="hero" aria-hidden="true">
          {#if hero}
            <!-- The preview teaches the mode: a marker to read, or an
                 outline waiting for one. -->
            <CountryMap
              pathD={hero.pathD}
              dotXY={hero.dotXY}
              width={HERO.width}
              height={HERO.height}
              quiet
              hideMarker={placing}
            />
          {/if}
        </div>

        <p class="eyebrow mono">
          {msg('surveyEyebrow')} · {game.countryCount}
          {msg('countries')}
        </p>

        <h1>
          <span class="line-a">{msg('taglineA')}</span>
          <span class="line-b">
            {placing ? msg('taglinePlaceB') : msg('taglineNameB')}
          </span>
        </h1>

        <p class="sub">
          {placing ? msg('taglinePlaceSub') : msg('taglineNameSub')}
        </p>

        <ModeToggle
          mode={game.mode}
          label={modeLabel}
          onchange={(m) => game.setMode(m)}
        />

        <button class="cta" onclick={() => game.startRun()}>
          {msg('beginRun')}
          <span class="arrow" aria-hidden="true">→</span>
        </button>
      </section>

      <!-- Results -->
    {:else if isOver}
      <section class="results">
        <p class="eyebrow mono">{msg('runOver')}</p>
        <p class="tally">
          <span class="tally-score">{game.state.score}</span>
          <span class="tally-unit">{msg('points')}</span>
        </p>
        <!--
          Naming and placing need different summaries. "8 of 10 answered" is
          naming vocabulary: in placing you answered all ten, and how close you
          got is the whole story — so that leads, and "on target" says plainly
          what the count actually counts.

          Best streak is a naming statistic and stays there. In placing, the
          two numbers that describe the run are the average error and the count
          that landed in the target; a third number about runs of them is noise
          on a line that is already doing enough work.
        -->
        <p class="sub">
          {#if placing}
            {#if averageOff !== null}
              {msg('averageOff')} <strong>{Math.round(averageOff)}</strong>
              {msg('km')} ·
            {/if}
            {game.state.correctCount} / {QUESTION_COUNT}
            {msg('onTarget')}
          {:else}
            {game.state.correctCount} / {QUESTION_COUNT}
            {msg('answered')} · {msg('bestStreak')}
            {game.state.bestStreak}
          {/if}
        </p>

        {#if game.state.error}
          <p class="fault-detail">{msg('couldNotSave')}: {game.state.error}</p>
        {/if}

        {#if game.state.phase !== 'leaderboard' && game.qualifies}
          <div class="claim">
            <p class="claim-title">{msg('newHighScore')}</p>
            <p class="mono">{msg('enterName')}</p>
            <div class="claim-row">
              <label class="sr-only" for="who">{msg('nameLabel')}</label>
              <input
                id="who"
                bind:value={game.playerName}
                maxlength="20"
                placeholder={msg('nameLabel')}
                autocomplete="off"
              />
              <button
                class="cta small"
                onclick={() => void game.submit()}
                disabled={game.state.phase === 'submitting'}
              >
                {game.state.phase === 'submitting'
                  ? msg('saving')
                  : msg('saveScore')}
              </button>
            </div>
          </div>
        {:else if game.state.phase !== 'leaderboard' && game.boardLoaded && !game.qualifies}
          <p class="mono">{msg('notAHighScore')}</p>
        {/if}

        {#if game.boardLoaded}
          <div class="board">
            <p class="eyebrow mono">{msg('highScores')}</p>
            {#if game.leaderboard.length === 0}
              <p class="mono">{msg('noScoresYet')}</p>
            {:else}
              <!-- Two columns past five entries: a full board would otherwise
                   need 95px it does not have on a laptop window. -->
              <ol class:split={game.leaderboard.length > 5}>
                {#each game.leaderboard as row, i (row.id)}
                  <li>
                    <span class="rank mono">{String(i + 1).padStart(2, '0')}</span>
                    <span class="who">{row.playerName}</span>
                    <span class="pts">{row.score}</span>
                  </li>
                {/each}
              </ol>
            {/if}
          </div>
        {/if}

        {#if game.state.phase === 'leaderboard' || (game.boardLoaded && !game.qualifies)}
          <button class="ghost" onclick={() => game.restart()}>
            {msg('playAgain')}
          </button>
        {/if}
      </section>

      <!-- Survey -->
    {:else if question && fitted}
      <section class="survey">
        <div class="chart-pane">
          <span class="coord mono">
            <!-- In placing mode this would simply be the answer. -->
            {placing && !revealing ? '' : readout(question.country.capitalLonLat)}
          </span>
          <div class="chart-holder">
            <CountryMap
              pathD={fitted.pathD}
              dotXY={fitted.dotXY}
              width={BOX.width}
              height={BOX.height}
              hideMarker={placing}
              guessXY={placing ? guessXY : null}
              revealed={revealing}
              targetPx={placing ? targetPx : null}
              onpick={placing && game.state.phase === 'question'
                ? dropMarker
                : undefined}
            />
          </div>
          <span class="caption mono">
            {msg('capitalLocation')}
            <span class="leader"></span>
          </span>
        </div>

        <div class="ask">
          <p class="eyebrow mono">{msg('identifyMarker')}</p>

          {#if placing}
            <h2 class="target">
              {msg('whereIs')}
              <span class="city">{question.country.capital}</span
              >{msg('questionMark')}
            </h2>
          {:else}
            <h2>{msg('whichCapital')}</h2>
          {/if}

          <!-- Directly above the answers: the eye is already here, choosing. -->
          <Timer remaining={game.remaining} total={game.total} />

          {#if placing}
            <div class="place-panel">
              {#if revealing}
                <PlacementResult
                  offKm={game.state.placedOffKm}
                  onTarget={isCloseEnough(
                    game.state.placedOffKm,
                    fitted.reachKm,
                  )}
                  bullseye={game.state.placedOffKm !== null &&
                    game.state.placedOffKm <= PLACE_FULL_KM}
                  points={game.lastPoints}
                  labels={{
                    offBy: msg('offBy'),
                    km: msg('km'),
                    bullseye: msg('bullseye'),
                    missed: msg('missed'),
                    points: msg('points'),
                  }}
                />
                <p class="legend mono">
                  <span class="key guess"></span>{msg('yourMarker')}
                  <span class="key truth"></span>{msg('actualMarker')}
                </p>
              {:else}
                <p class="hint mono">{coarse ? msg('tapToPlace') : msg('clickToPlace')}</p>
              {/if}
            </div>
          {:else}
            <div class="options">
              {#each question.options as option, i (option)}
                <AnswerButton
                  label={option}
                  index={i}
                  state={optionState(i)}
                  onpick={(idx) => game.pick(idx)}
                />
              {/each}
            </div>
          {/if}
        </div>
      </section>
    {/if}
  </main>

  <footer class="bar foot" class:empty={game.state.phase !== 'ready'}>
    {#if game.state.phase === 'ready'}
      <span class="mono best">
        {#if game.bestScore}
          <span class="nb">{msg('bestScore')}</span>
          <span class="nb"><strong>{game.bestScore.score}</strong> · {game.bestScore.playerName}</span>
        {:else}
          {msg('noBestYet')}
        {/if}
      </span>
      {#if !showBoard}
        <button class="foot-link mono" onclick={openBoard}>
          {msg('viewScores')}
        </button>
      {/if}
    {/if}
  </footer>
</div>

<style>
  .frame {
    display: flex;
    flex-direction: column;
    gap: clamp(0.5rem, 1.4vh, 1rem);
    height: 100dvh;
    max-width: 82rem;
    margin: 0 auto;
    /*
     * env(safe-area-inset-*) is 0 everywhere except on a notched or
     * gesture-bar phone, where max() lifts the padding clear of the cutout.
     */
    padding-top: max(clamp(0.7rem, 2vh, 1.4rem), env(safe-area-inset-top));
    padding-bottom: max(clamp(0.6rem, 1.6vh, 1.2rem), env(safe-area-inset-bottom));
    padding-left: max(clamp(1rem, 4vw, 3rem), env(safe-area-inset-left));
    padding-right: max(clamp(1rem, 4vw, 3rem), env(safe-area-inset-right));
  }

  .bar {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    align-items: center;
    gap: 1.5rem;
  }
  .counter {
    justify-self: center;
  }
  .rule {
    height: 1px;
    background: var(--grid);
  }

  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    /*
     * Vertical is a safety valve for very short windows. Horizontal is always
     * hidden: `overflow-y: auto` alone would force overflow-x to `auto` too,
     * so any stray pixel of lateral ink becomes a scrollbar.
     */
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
  }

  /* Both classes: a later `.bar` rule at 940px sets two columns and would win
     on source order otherwise, leaving an empty track. */
  .bar.foot {
    /*
     * One cell. It used to be four — the best score, two blank spacers, and a
     * note naming the projection — and on a phone the spacers stole width from
     * the only two cells that had any, so both wrapped mid-phrase. The note is
     * gone and the spacers with it.
     */
    grid-template-columns: 1fr;
    justify-items: center;
    min-height: 1.2rem;
  }

  /* Score and link on one centred line, wrapping together if they must. */
  .bar.foot {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: baseline;
    gap: 0.35rem 1rem;
  }

  /*
   * A link rather than a button in looks: it sits in a line of quiet metadata
   * and a filled control there would shout over the one thing the footer is
   * for. Still a real button, so it is reachable by keyboard.
   */
  .foot-link {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    letter-spacing: inherit;
    color: var(--brass);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .foot-link:hover,
  .foot-link:focus-visible {
    color: var(--paper);
  }

  .board-page {
    gap: 1.1rem;
  }

  .board-list {
    width: min(30rem, 100%);
    margin: 0 auto;
  }

  .empty-board {
    color: var(--dim);
  }

  .board-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.75rem;
  }

  .confirm-ask {
    color: var(--alarm);
    max-width: 28rem;
    text-wrap: balance;
  }

  /* Destructive, and dressed like it. */
  .danger {
    background: none;
    border: 1px solid var(--alarm);
    color: var(--alarm);
    padding: 0.55rem 1.1rem;
    font: inherit;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .danger:hover:not(:disabled),
  .danger:focus-visible {
    background: var(--alarm);
    color: var(--abyss);
  }

  .danger:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Keeps "MEILLEUR SCORE" and "1667 · IAGO" each in one piece. */
  .nb {
    white-space: nowrap;
  }

  .best {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0 0.4rem;
  }

  /* Nothing to show outside the title screen; on a phone that is 30px of air. */
  .foot.empty {
    display: none;
  }

  /* ── Title ─────────────────────────────────────────────── */
  .title {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: clamp(0.5rem, 1.5vh, 1.1rem);
    padding: clamp(0.5rem, 1.5vh, 1rem) 0 clamp(0.5rem, 2vh, 1.5rem);
  }
  .hero {
    width: min(420px, 60vw);
    /* Gives up height first when the window is short: the outline is
       atmosphere, the headline and the button are the job. */
    height: clamp(120px, 24vh, 280px);
    display: grid;
    place-items: center;
  }
  .eyebrow {
    margin: 0;
    color: var(--sage);
  }
  h1 {
    margin: 0;
    display: flex;
    flex-direction: column;
    line-height: 0.98;
  }
  .line-a {
    font-size: clamp(1.9rem, min(6.2vw, 7.4vh), 4.2rem);
    font-weight: 700;
    letter-spacing: -0.035em;
    color: var(--paper);
  }
  .line-b {
    font-family: var(--serif);
    font-style: italic;
    font-weight: 400;
    font-size: clamp(2.1rem, min(6.8vw, 8.2vh), 4.6rem);
    letter-spacing: -0.01em;
    color: var(--brass);
  }
  .sub {
    margin: 0;
    max-width: 34ch;
    color: var(--dim);
    font-size: 1rem;
  }

  .cta {
    display: inline-flex;
    align-items: center;
    gap: 1.4rem;
    margin-top: clamp(0.2rem, 1vh, 0.6rem);
    padding: clamp(0.7rem, 1.6vh, 0.95rem) 1.7rem;
    border: 0;
    border-radius: 3px;
    background: var(--brass);
    color: var(--abyss);
    font: inherit;
    font-weight: 600;
    font-size: 1.02rem;
    cursor: pointer;
    transition:
      transform 160ms cubic-bezier(0.2, 0.9, 0.3, 1),
      box-shadow 160ms ease;
  }
  .cta:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 10px 26px color-mix(in oklab, var(--brass) 28%, transparent);
  }
  .cta:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .cta .arrow {
    transition: transform 160ms ease;
  }
  .cta:hover:not(:disabled) .arrow {
    transform: translateX(4px);
  }
  .cta.small {
    padding: 0.6rem 1.1rem;
    font-size: 0.92rem;
    gap: 0;
    margin-top: 0;
  }

  /* ── Survey ────────────────────────────────────────────── */
  .survey {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1.55fr) minmax(19rem, 1fr);
    gap: clamp(1.5rem, 4vw, 3.5rem);
    align-items: stretch;
    min-height: 0;
  }
  .chart-pane {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-height: 0;
    padding-right: clamp(1rem, 3vw, 2.5rem);
    border-right: 1px solid var(--grid);
  }
  .chart-holder {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .coord {
    color: var(--sage);
  }
  .caption {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .leader {
    flex: 1;
    max-width: 7rem;
    height: 1px;
    background: var(--grid);
  }

  .ask {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.9rem;
  }
  .ask h2 {
    margin: 0 0 0.5rem;
    font-size: clamp(1.6rem, 2.6vw, 2.2rem);
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 1.1;
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    margin-top: 0.35rem;
  }

  /*
   * The placing column is deliberately near-empty while the question is live.
   * The map is the interface; anything else here competes with it for the
   * attention the player needs on the outline.
   */
  .place-panel {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-top: 0.35rem;
    min-height: 6.5rem;
  }
  .hint {
    margin: 0;
    color: var(--sage);
  }
  .target {
    font-weight: 400;
  }
  .target .city {
    font-family: var(--serif);
    font-style: italic;
    color: var(--brass);
    font-size: 1.15em;
  }
  .legend {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    flex-wrap: wrap;
  }
  .key {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    display: inline-block;
  }
  .key + .key {
    margin-left: 0.8rem;
  }
  .key.guess {
    border: 1.5px solid var(--paper);
    background: color-mix(in oklab, var(--paper) 12%, transparent);
  }
  .key.truth {
    background: var(--brass);
  }

  /* ── Results ───────────────────────────────────────────── */
  .results {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: clamp(0.45rem, 1.3vh, 0.9rem);
    padding: clamp(0.5rem, 2vh, 1.5rem) 0;
  }
  .tally {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
  }
  .tally-score {
    font-family: var(--serif);
    font-style: italic;
    font-size: clamp(2.6rem, min(9vw, 11vh), 5rem);
    line-height: 1;
    color: var(--brass);
  }
  .tally-unit {
    font-family: var(--mono);
    font-size: 0.78rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--dim);
  }

  .claim {
    display: flex;
    flex-direction: column;
    gap: clamp(0.35rem, 1vh, 0.7rem);
    align-items: center;
    /*
     * Without this the box sizes to its content — input plus button plus
     * padding — and simply overhangs a narrow screen, taking the Save button
     * off the edge with it. `.results` centres its children rather than
     * stretching them, so nothing else was constraining the width.
     */
    max-width: 100%;
    padding: clamp(0.7rem, 1.8vh, 1.2rem) clamp(0.9rem, 4vw, 1.6rem);
    border: 1px solid var(--brass-dim);
    border-radius: 4px;
    background: color-mix(in oklab, var(--brass) 8%, transparent);
  }
  .claim-title {
    margin: 0;
    font-family: var(--serif);
    font-style: italic;
    font-size: clamp(1.2rem, 2.6vh, 1.6rem);
    color: var(--brass);
  }
  .claim .mono {
    margin: 0;
  }
  .claim-row {
    display: flex;
    gap: 0.5rem;
    width: 100%;
  }
  input {
    /* min-width:0 lets the field shrink; a text input otherwise refuses to go
       below its default intrinsic size and pushes its neighbour off-screen. */
    flex: 1 1 auto;
    min-width: 0;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--grid);
    border-radius: 3px;
    background: var(--abyss);
    color: var(--paper);
    font: inherit;
  }
  input::placeholder {
    color: var(--dim);
  }

  .board {
    width: min(24rem, 100%);
    text-align: left;
    margin-top: clamp(0.15rem, 0.8vh, 0.5rem);
    transition: width 200ms ease;
  }
  /*
   * The two-column board was added to reclaim vertical space on a short laptop
   * window. On a phone there is no horizontal room for it: two columns of names
   * overflowed a 360px screen by 49px. Below this width the list stays single
   * -column, where the constraint is height, not width.
   */
  @media (min-width: 560px) {
    .board:has(.split) {
      width: min(40rem, 100%);
    }
    .board ol.split {
      display: grid;
      grid-template-rows: repeat(5, auto);
      grid-auto-flow: column;
      column-gap: 2.5rem;
    }
  }
  .board ol {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0;
  }
  .board li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.9rem;
    align-items: baseline;
    /* Ten rows on a short laptop window: the list gives up padding first. */
    padding: clamp(0.15rem, 0.55vh, 0.45rem) 0;
    border-bottom: 1px solid var(--grid);
  }
  .rank {
    color: var(--brass-dim);
  }
  .pts {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
  }

  .ghost {
    margin-top: 0.5rem;
    padding: 0.7rem 1.4rem;
    border: 1px solid var(--grid);
    border-radius: 3px;
    background: transparent;
    color: var(--paper);
    font: inherit;
    cursor: pointer;
    transition: border-color 140ms ease;
  }
  .ghost:hover {
    border-color: var(--brass);
  }

  .centred {
    margin: auto;
  }
  .fault {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    text-align: center;
    max-width: 34rem;
  }
  .fault-detail {
    margin: 0;
    color: var(--alarm);
    font-family: var(--mono);
    font-size: 0.85rem;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  /*
   * Short phones with a full ten-row board. Whitespace is squeezed rather than
   * rows hidden: dropping scores from the list to avoid a scrollbar would be
   * solving a layout problem by removing the content the screen is for.
   */
  @media (max-height: 700px) and (max-width: 560px) {
    .results {
      padding: 0;
      gap: 0.35rem;
    }
    .board {
      margin-top: 0;
    }
    .tally-score {
      font-size: 2.2rem;
    }
  }

  @media (max-width: 480px) {
    .claim-row {
      flex-direction: column;
      align-items: stretch;
    }
    .claim-row .cta {
      justify-content: center;
    }
  }

  @media (max-width: 940px) {
    .survey {
      grid-template-columns: 1fr;
      /*
       * Stacked, both rows would otherwise size to their content and the map
       * would collapse to whatever was left — 205px on a phone. Giving the
       * chart the flexible row and the answers their natural height puts the
       * map back at roughly half the screen, which is what it is for.
       */
      grid-template-rows: minmax(0, 1fr) auto;
      gap: clamp(0.75rem, 2vh, 1.5rem);
    }
    .chart-pane {
      border-right: 0;
      border-bottom: 1px solid var(--grid);
      padding-right: 0;
      padding-bottom: clamp(0.5rem, 1.5vh, 1rem);
    }
    .ask {
      justify-content: flex-start;
      gap: 0.5rem;
    }
    .ask h2 {
      margin-bottom: 0.1rem;
      font-size: clamp(1.25rem, 5.2vw, 1.7rem);
    }
    /*
     * Every row removed here is a row the map gains. The eyebrow repeats what
     * the question underneath already says, and the chart caption labels a dot
     * that needs no label — both are breathing room on a desktop and rent on a
     * phone.
     */
    .ask .eyebrow,
    .caption {
      display: none;
    }
    .options {
      gap: 0.4rem;
      margin-top: 0.2rem;
    }
    .chart-pane {
      gap: 0.35rem;
    }
    .bar {
      grid-template-columns: 1fr auto;
      row-gap: 0.6rem;
    }
    .counter {
      justify-self: start;
    }
  }
</style>
