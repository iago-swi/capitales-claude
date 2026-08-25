<script lang="ts">
  interface Props {
    /** Distance from the real capital, or null when nothing was placed. */
    offKm: number | null;
    /**
     * Whether that counted as on target. Decided by the caller, because the
     * threshold depends on the size of the country being asked about — 200 km
     * is a miss in Switzerland and a good guess in Canada.
     */
    onTarget: boolean;
    /** Whether it was close enough to read as a bullseye rather than a number. */
    bullseye: boolean;
    points: number;
    labels: {
      offBy: string;
      km: string;
      bullseye: string;
      missed: string;
      points: string;
    };
  }
  let { offKm, onTarget, bullseye, points, labels }: Props = $props();

  let close = $derived(offKm !== null && onTarget);

  /** Whole kilometres below 100, then rounded — false precision helps nobody. */
  let shown = $derived(
    offKm === null ? '' : offKm < 100 ? Math.round(offKm) : Math.round(offKm / 10) * 10,
  );
</script>

<div class="result" class:close class:far={offKm !== null && !close}>
  {#if offKm === null}
    <span class="verdict mono">{labels.missed}</span>
  {:else if bullseye}
    <span class="verdict mono">{labels.bullseye}</span>
  {:else}
    <span class="verdict mono">
      {labels.offBy}
      <strong>{shown}</strong>
      {labels.km}
    </span>
  {/if}
  <span class="points">+{points}</span>
</div>

<style>
  .result {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.7rem 0.9rem;
    border: 1px solid var(--grid);
    border-radius: 4px;
    background: color-mix(in oklab, var(--shelf) 55%, transparent);
  }
  .result.close {
    border-color: var(--signal);
    background: color-mix(in oklab, var(--signal) 14%, transparent);
  }
  .result.far {
    border-color: var(--warn);
    background: color-mix(in oklab, var(--warn) 12%, transparent);
  }
  .verdict {
    color: var(--paper);
  }
  .verdict strong {
    font-size: 1.05rem;
  }
  .points {
    font-family: var(--mono);
    font-size: 1.15rem;
    font-variant-numeric: tabular-nums;
    color: var(--brass);
  }
  .result.far .points {
    color: var(--warn);
  }
</style>
