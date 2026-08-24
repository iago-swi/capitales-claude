<script lang="ts">
  import { onMount } from 'svelte';
  import type { Topology } from 'topojson-specification';
  import { buildAtlas, fitCountry } from '@capitales/geo';
  import { isCorrect, t } from '@capitales/core';
  import {
    AnswerButton,
    CountryMap,
    LanguageToggle,
    Scoreboard,
    Timer,
  } from '@capitales/ui';
  import topo from '../../../packages/data/countries.topo.json';
  import { createGame, QUESTION_COUNT } from './game.svelte.js';

  const atlas = buildAtlas(topo as unknown as Topology);
  const BOX = { width: 640, height: 420 };

  const game = createGame();

  let question = $derived(game.state.questions[game.state.index]);
  let msg = $derived((key: Parameters<typeof t>[1]) => t(game.lang, key));

  let fitted = $derived.by(() => {
    if (!question) return null;
    const f = atlas.get(question.country.code);
    if (!f) return null;
    return fitCountry(f, question.country.capitalLonLat, BOX);
  });

  function optionState(i: number): 'idle' | 'correct' | 'wrong' | 'muted' {
    if (game.state.phase !== 'revealing' || !question) return 'idle';
    if (isCorrect(question, question.options[i] ?? '')) return 'correct';
    if (game.state.chosenIndex === i) return 'wrong';
    return 'muted';
  }

  function onKey(event: KeyboardEvent) {
    if (game.state.phase !== 'question') return;
    const n = Number(event.key);
    if (n >= 1 && n <= 4) game.pick(n - 1);
  }

  let isOver = $derived(
    game.state.phase === 'finished' ||
      game.state.phase === 'submitting' ||
      game.state.phase === 'leaderboard',
  );

  onMount(() => {
    void game.boot();
  });
</script>

<svelte:window onkeydown={onKey} />

<main>
  <nav>
    <LanguageToggle lang={game.lang} onchange={(l) => game.setLang(l)} />
  </nav>

  {#if game.state.phase === 'loading' || game.state.phase === 'idle'}
    <p class="centred">{msg('loading')}</p>
  {:else if game.state.phase === 'error'}
    <div class="centred error">
      <h1>{msg('cannotStart')}</h1>
      <p>{game.state.error}</p>
    </div>
  {:else if isOver}
    <div class="centred results">
      <h1>{game.state.score} {msg('points')}</h1>
      <p class="summary">
        {game.state.correctCount}
        {msg('correctOf')}
        {QUESTION_COUNT} · {msg('bestStreak')}
        {game.state.bestStreak}
      </p>

      {#if game.state.error}
        <p class="banner">{msg('couldNotSave')}: {game.state.error}</p>
      {/if}

      {#if game.state.phase !== 'leaderboard' && game.qualifies}
        <!-- Only asked for when the score actually earned a place. -->
        <div class="claim">
          <p class="cheer">{msg('newHighScore')}</p>
          <p>{msg('enterName')}</p>
          <label>
            <span class="sr-only">{msg('nameLabel')}</span>
            <input
              bind:value={game.playerName}
              maxlength="20"
              placeholder={msg('nameLabel')}
              autocomplete="off"
            />
          </label>
          <button
            class="primary"
            onclick={() => void game.submit()}
            disabled={game.state.phase === 'submitting'}
          >
            {game.state.phase === 'submitting' ? msg('saving') : msg('saveScore')}
          </button>
        </div>
      {:else if game.state.phase !== 'leaderboard' && game.boardLoaded && !game.qualifies}
        <!-- Only before saving. Once the score IS on the board, telling the
             player they missed the top 10 would contradict the list below. -->
        <p class="miss">{msg('notAHighScore')}</p>
      {/if}

      {#if game.boardLoaded}
        <section class="board">
          <h2>{msg('highScores')}</h2>
          {#if game.leaderboard.length === 0}
            <p class="empty">{msg('noScoresYet')}</p>
          {:else}
            <ol>
              {#each game.leaderboard as row (row.id)}
                <li><span>{row.playerName}</span><span>{row.score}</span></li>
              {/each}
            </ol>
          {/if}
        </section>
      {/if}

      {#if game.state.phase === 'leaderboard' || (game.boardLoaded && !game.qualifies)}
        <button onclick={() => game.restart()}>{msg('playAgain')}</button>
      {/if}
    </div>
  {:else if question && fitted}
    <header>
      <Scoreboard
        score={game.state.score}
        streak={game.state.streak}
        questionNumber={game.state.index + 1}
        questionCount={QUESTION_COUNT}
      />
      <Timer remaining={game.remaining} total={game.total} />
    </header>

    <section class="map">
      <CountryMap
        pathD={fitted.pathD}
        dotXY={fitted.dotXY}
        width={BOX.width}
        height={BOX.height}
      />
    </section>

    <p class="prompt">{msg('whichCapital')}</p>

    <section class="answers">
      {#each question.options as option, i (option)}
        <AnswerButton
          label={option}
          index={i}
          state={optionState(i)}
          onpick={(idx) => game.pick(idx)}
        />
      {/each}
    </section>
  {/if}
</main>

<style>
  main {
    max-width: 44rem;
    margin: 0 auto;
    padding: 1rem 1.5rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-height: 100dvh;
  }
  nav {
    display: flex;
    justify-content: flex-end;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
  }
  header :global(.timer) {
    flex: 1;
    max-width: 14rem;
  }
  .map {
    flex: 1;
    min-height: 18rem;
    display: grid;
    place-items: center;
  }
  .prompt {
    margin: 0;
    text-align: center;
    opacity: 0.7;
    font-size: 0.95rem;
  }
  .answers {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }
  .centred {
    margin: auto;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
  }
  .results h1 {
    margin: 0;
    font-size: 2.5rem;
  }
  .summary {
    margin: 0;
    opacity: 0.75;
  }
  .error {
    color: tomato;
    max-width: 32rem;
  }
  .banner {
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    background: color-mix(in oklab, tomato 20%, transparent);
  }
  .claim {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    align-items: center;
    padding: 1rem 1.25rem;
    border-radius: 0.75rem;
    background: color-mix(in oklab, gold 18%, transparent);
  }
  .cheer {
    margin: 0;
    font-weight: 700;
    font-size: 1.15rem;
  }
  .claim p {
    margin: 0;
  }
  .miss {
    margin: 0;
    opacity: 0.7;
  }
  input {
    padding: 0.5rem 0.75rem;
    border: 1px solid color-mix(in oklab, currentColor 30%, transparent);
    border-radius: 0.375rem;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: center;
  }
  button {
    min-height: 44px;
    padding: 0.5rem 1.25rem;
    border: 1px solid color-mix(in oklab, currentColor 30%, transparent);
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  button.primary {
    background: color-mix(in oklab, currentColor 12%, transparent);
    font-weight: 600;
  }
  button:hover:not(:disabled) {
    background: color-mix(in oklab, currentColor 10%, transparent);
  }
  .board {
    width: 20rem;
    max-width: 100%;
  }
  .board h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.7;
  }
  .board ol {
    list-style: decimal inside;
    padding: 0;
    margin: 0;
  }
  .board li {
    display: flex;
    justify-content: space-between;
    padding: 0.25rem 0;
    font-variant-numeric: tabular-nums;
    border-bottom: 1px solid color-mix(in oklab, currentColor 10%, transparent);
  }
  .empty {
    margin: 0;
    opacity: 0.6;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>
