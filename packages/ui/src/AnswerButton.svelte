<script lang="ts">
  interface Props {
    label: string;
    index: number;
    state: 'idle' | 'correct' | 'wrong' | 'muted';
    onpick: (index: number) => void;
  }
  let { label, index, state, onpick }: Props = $props();
</script>

<button
  type="button"
  class="answer {state}"
  disabled={state !== 'idle'}
  onclick={() => onpick(index)}
>
  <kbd>{index + 1}</kbd>
  <span>{label}</span>
</button>

<style>
  .answer {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    /* The accessibility floor for a tap target. It lives here rather than in
       the web app so the mobile shell inherits it unchanged. */
    min-height: 44px;
    padding: 0.75rem 1rem;
    border: 1px solid color-mix(in oklab, currentColor 25%, transparent);
    border-radius: 0.5rem;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .answer:hover:not(:disabled) {
    background: color-mix(in oklab, currentColor 8%, transparent);
  }
  .answer:disabled {
    cursor: default;
  }
  .answer.correct {
    border-color: seagreen;
    background: color-mix(in oklab, seagreen 20%, transparent);
  }
  .answer.wrong {
    border-color: tomato;
    background: color-mix(in oklab, tomato 20%, transparent);
  }
  .answer.muted {
    opacity: 0.45;
  }
  kbd {
    flex: none;
    display: grid;
    place-items: center;
    width: 1.6em;
    height: 1.6em;
    border-radius: 0.3em;
    background: color-mix(in oklab, currentColor 15%, transparent);
    font-size: 0.8em;
  }
</style>
