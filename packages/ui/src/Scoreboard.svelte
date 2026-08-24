<script lang="ts">
  interface Props {
    score: number;
    streak: number;
    label: string;
  }
  let { score, streak, label }: Props = $props();
</script>

<div class="readout">
  <span class="mono">{label}</span>
  <strong class="value">{score}</strong>
  {#if streak >= 2}
    <span class="streak mono" title="streak">×{streak}</span>
  {/if}
</div>

<style>
  .readout {
    display: inline-flex;
    align-items: baseline;
    gap: 0.6rem;
  }
  .value {
    font-family: var(--mono);
    font-size: 1.35rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    color: var(--paper);
    line-height: 1;
  }
  .streak {
    color: var(--brass);
    font-size: 0.78rem;
    letter-spacing: 0.1em;
  }
</style>
