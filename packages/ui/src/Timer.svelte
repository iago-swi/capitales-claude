<script lang="ts">
  interface Props {
    remaining: number;
    total: number;
  }
  let { remaining, total }: Props = $props();

  let fraction = $derived(total > 0 ? Math.max(0, remaining / total) : 0);
  let seconds = $derived(Math.ceil(remaining / 1000));
  let urgent = $derived(fraction <= 0.25);
</script>

<div class="timer" role="timer" aria-label="{seconds} seconds remaining">
  <div class="bar" class:urgent style="--fraction: {fraction}"></div>
  <span class="seconds" class:urgent>{seconds}</span>
</div>

<style>
  .timer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .bar {
    position: relative;
    flex: 1;
    height: 6px;
    border-radius: 999px;
    background: color-mix(in oklab, currentColor 15%, transparent);
    overflow: hidden;
  }
  .bar::after {
    content: '';
    position: absolute;
    inset: 0;
    transform-origin: left;
    transform: scaleX(var(--fraction));
    background: currentColor;
  }
  .bar.urgent::after {
    background: tomato;
  }
  .seconds {
    /* Stops the countdown jittering as digit widths change. */
    font-variant-numeric: tabular-nums;
    min-width: 2ch;
    text-align: right;
  }
  .seconds.urgent {
    color: tomato;
  }
</style>
