<script lang="ts">
  import { onMount } from 'svelte';
  import type { Topology } from 'topojson-specification';
  import { buildAtlas, fitCountry } from '@capitales/geo';
  import { isCorrect, t, type MessageKey } from '@capitales/core';
  import {
    AnswerButton,
    CountryMap,
    LanguageToggle,
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

  function optionState(i: number): 'idle' | 'correct' | 'wrong' | 'muted' {
    if (game.state.phase !== 'revealing' || !question) return 'idle';
    if (isCorrect(question, question.options[i] ?? '')) return 'correct';
    if (game.state.chosenIndex === i) return 'wrong';
    return 'muted';
  }

  function onKey(event: KeyboardEvent) {
    if (game.state.phase === 'ready' && event.key === 'Enter') {
      game.startRun();
      return;
    }
    if (game.state.phase !== 'question') return;
    // Both the printed letter and its position on the number row.
    const letter = 'abcd'.indexOf(event.key.toLowerCase());
    const digit = Number(event.key) - 1;
    const i = letter >= 0 ? letter : digit;
    if (i >= 0 && i < 4) game.pick(i);
  }

  let isOver = $derived(
    game.state.phase === 'finished' ||
      game.state.phase === 'submitting' ||
      game.state.phase === 'leaderboard',
  );

  onMount(() => {
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

      <!-- Title screen -->
    {:else if game.state.phase === 'ready'}
      <section class="title">
        <div class="hero" aria-hidden="true">
          {#if hero}
            <CountryMap
              pathD={hero.pathD}
              dotXY={hero.dotXY}
              width={HERO.width}
              height={HERO.height}
              quiet
            />
          {/if}
        </div>

        <p class="eyebrow mono">
          {msg('surveyEyebrow')} · {game.countryCount}
          {msg('countries')}
        </p>

        <h1>
          <span class="line-a">{msg('taglineA')}</span>
          <span class="line-b">{msg('taglineB')}</span>
        </h1>

        <p class="sub">{msg('taglineSub')}</p>

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
        <p class="sub">
          {game.state.correctCount} / {QUESTION_COUNT}
          {msg('answered')} · {msg('bestStreak')}
          {game.state.bestStreak}
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
            {readout(question.country.capitalLonLat)}
          </span>
          <div class="chart-holder">
            <CountryMap
              pathD={fitted.pathD}
              dotXY={fitted.dotXY}
              width={BOX.width}
              height={BOX.height}
            />
          </div>
          <span class="caption mono">
            {msg('capitalLocation')}
            <span class="leader"></span>
          </span>
        </div>

        <div class="ask">
          <p class="eyebrow mono">{msg('identifyMarker')}</p>
          <h2>{msg('whichCapital')}</h2>

          <!-- Directly above the options: the eye is already here, choosing. -->
          <Timer remaining={game.remaining} total={game.total} />

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
        </div>
      </section>
    {/if}
  </main>

  <footer class="bar foot">
    {#if game.state.phase === 'ready'}
      <span class="mono">
        {#if game.bestScore}
          {msg('bestScore')}
          <strong>{game.bestScore.score}</strong> · {game.bestScore.playerName}
        {:else}
          {msg('noBestYet')}
        {/if}
      </span>
      <span></span>
      <span></span>
      <span class="mono">{msg('projection')}</span>
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
    padding: clamp(0.7rem, 2vh, 1.4rem) clamp(1rem, 4vw, 3rem)
      clamp(0.6rem, 1.6vh, 1.2rem);
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

  .foot {
    grid-template-columns: 1fr auto auto 1fr;
    min-height: 1.2rem;
  }
  .foot .mono:last-child {
    justify-self: end;
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
    padding: clamp(0.7rem, 1.8vh, 1.2rem) 1.6rem;
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
  }
  input {
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
  .board:has(.split) {
    width: min(40rem, 100%);
  }
  .board ol {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0;
  }
  .board ol.split {
    display: grid;
    grid-template-rows: repeat(5, auto);
    grid-auto-flow: column;
    column-gap: 2.5rem;
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

  @media (max-width: 940px) {
    .survey {
      grid-template-columns: 1fr;
    }
    .chart-pane {
      border-right: 0;
      border-bottom: 1px solid var(--grid);
      padding-right: 0;
      padding-bottom: 1rem;
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
