<script lang="ts">
  interface Props {
    label: string;
    index: number;
    state: 'idle' | 'correct' | 'wrong' | 'muted';
    onpick: (index: number) => void;
  }
  let { label, index, state, onpick }: Props = $props();

  // The letter is not decoration: it is the key you can press.
  const KEYS = ['A', 'B', 'C', 'D'];
  let key = $derived(KEYS[index] ?? String(index + 1));
</script>

<button
  type="button"
  class="answer {state}"
  disabled={state !== 'idle'}
  onclick={() => onpick(index)}
>
  <kbd>{key}</kbd>
  <span class="label">{label}</span>
  <span class="verdict" aria-hidden="true">
    {#if state === 'correct'}✓{:else if state === 'wrong'}✕{/if}
  </span>
</button>

<style>
  .answer {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.9rem;
    width: 100%;
    min-height: 56px;
    padding: 0.7rem 1rem;
    border: 1px solid var(--grid);
    border-radius: 4px;
    background: color-mix(in oklab, var(--shelf) 55%, transparent);
    color: var(--paper);
    font: inherit;
    font-size: 1.05rem;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 140ms ease,
      background 140ms ease,
      transform 140ms ease;
  }

  .answer:hover:not(:disabled) {
    border-color: var(--brass);
    background: color-mix(in oklab, var(--shelf) 90%, transparent);
    transform: translateX(3px);
  }

  .answer:disabled {
    cursor: default;
  }

  kbd {
    display: grid;
    place-items: center;
    width: 1.9em;
    height: 1.9em;
    border: 1px solid var(--grid);
    border-radius: 3px;
    background: var(--abyss);
    font-family: var(--mono);
    font-size: 0.7rem;
    color: var(--dim);
    transition: all 140ms ease;
  }
  .answer:hover:not(:disabled) kbd {
    color: var(--brass);
    border-color: var(--brass-dim);
  }

  .label {
    min-width: 0;
    overflow-wrap: break-word;
  }

  .verdict {
    font-family: var(--mono);
    font-size: 1rem;
  }

  .answer.correct {
    border-color: var(--signal);
    background: color-mix(in oklab, var(--signal) 16%, transparent);
  }
  .answer.correct kbd {
    color: var(--signal);
    border-color: var(--signal);
  }
  .answer.correct .verdict {
    color: var(--signal);
  }

  .answer.wrong {
    border-color: var(--alarm);
    background: color-mix(in oklab, var(--alarm) 16%, transparent);
  }
  .answer.wrong kbd {
    color: var(--alarm);
    border-color: var(--alarm);
  }
  .answer.wrong .verdict {
    color: var(--alarm);
  }

  .answer.muted {
    opacity: 0.35;
  }

  /*
   * Touch input. The letter badge advertises a key that does not exist on a
   * phone, so it goes — and with it the hover affordances, which on touch fire
   * as a sticky state after a tap rather than as a preview.
   */
  @media (hover: none) and (pointer: coarse) {
    kbd {
      display: none;
    }
    .answer {
      grid-template-columns: 1fr auto;
      min-height: 60px;
      padding: 0.8rem 1.1rem;
    }
    .answer:hover:not(:disabled) {
      transform: none;
      border-color: var(--grid);
      background: color-mix(in oklab, var(--shelf) 55%, transparent);
    }
    /* Replaces hover as the "something happened" signal. */
    .answer:active:not(:disabled) {
      transform: scale(0.985);
      border-color: var(--brass);
    }
  }
</style>
