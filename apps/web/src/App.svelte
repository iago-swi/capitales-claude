<script lang="ts">
  import { onMount } from 'svelte';
  import type { Topology } from 'topojson-specification';
  import { buildAtlas, fitCountry } from '@capitales/geo';
  import { isCorrect } from '@capitales/core';
  import { AnswerButton, CountryMap, Scoreboard, Timer } from '@capitales/ui';
  import topo from '../../../packages/data/countries.topo.json';
  import { createGame, QUESTION_COUNT } from './game.svelte.js';

  const atlas = buildAtlas(topo as unknown as Topology);
  const BOX = { width: 640, height: 420 };

  const game = createGame();

  let question = $derived(game.state.questions[game.state.index]);

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

  onMount(() => {
    void game.boot();
  });
</script>

<svelte:window onkeydown={onKey} />

<main>
  {#if game.state.phase === 'loading' || game.state.phase === 'idle'}
    <p class="centred">Loading…</p>
  {:else if game.state.phase === 'error'}
    <div class="centred error">
      <h1>Cannot start</h1>
      <p>{game.state.error}</p>
    </div>
  {:else if game.state.phase === 'finished' || game.state.phase === 'submitting' || game.state.phase === 'leaderboard'}
    <div class="centred results">
      <h1>{game.state.score} points</h1>
      <p>
        {game.state.correctCount} of {QUESTION_COUNT} correct · best streak {game
          .state.bestStreak}
      </p>

      {#if game.state.error}
        <p class="banner">Could not save your score: {game.state.error}</p>
      {/if}

      {#if game.state.phase === 'leaderboard'}
        <ol class="leaderboard">
          {#each game.leaderboard as row (row.id)}
            <li><span>{row.playerName}</span><span>{row.score}</span></li>
          {/each}
        </ol>
        <button onclick={() => game.restart()}>Play again</button>
      {:else}
        <label>
          Name
          <input bind:value={game.playerName} maxlength="20" />
        </label>
        <button
          onclick={() => void game.submit()}
          disabled={game.state.phase === 'submitting'}
        >
          {game.state.phase === 'submitting' ? 'Saving…' : 'Save score'}
        </button>
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
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    min-height: 100dvh;
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
  .error {
    color: tomato;
    max-width: 32rem;
  }
  .banner {
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    background: color-mix(in oklab, tomato 20%, transparent);
  }
  .leaderboard {
    list-style: decimal inside;
    padding: 0;
    width: 18rem;
  }
  .leaderboard li {
    display: flex;
    justify-content: space-between;
    padding: 0.25rem 0;
    font-variant-numeric: tabular-nums;
  }
  button {
    font: inherit;
    padding: 0.6rem 1.2rem;
    border-radius: 0.5rem;
    border: 1px solid color-mix(in oklab, currentColor 30%, transparent);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  input {
    font: inherit;
    padding: 0.4rem 0.6rem;
    margin-left: 0.5rem;
    border-radius: 0.375rem;
    border: 1px solid color-mix(in oklab, currentColor 30%, transparent);
    background: transparent;
    color: inherit;
  }
</style>
