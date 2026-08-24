<script lang="ts">
  interface Props {
    pathD: string;
    dotXY: [number, number];
    width: number;
    height: number;
    /** Ambient mode: outline only, no marker rings. Used on the title screen. */
    quiet?: boolean;
  }
  let { pathD, dotXY, width, height, quiet = false }: Props = $props();

  // Re-keying on the path restarts the draw-in and the marker pulse whenever a
  // new country arrives, without any imperative animation code.
  let gridId = $derived(`grat-${width}x${height}`);
</script>

<svg
  class="chart"
  class:quiet
  viewBox="0 0 {width} {height}"
  role="img"
  aria-label="Country outline with its capital marked"
>
  <defs>
    <pattern id={gridId} width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0H0V32" fill="none" stroke="var(--grid)" stroke-width="0.5" />
    </pattern>
    <radialGradient id="halo">
      <stop offset="0%" stop-color="var(--brass)" stop-opacity="0.5" />
      <stop offset="100%" stop-color="var(--brass)" stop-opacity="0" />
    </radialGradient>
  </defs>

  <!-- Graticule: the chart the land is drawn on, not decoration behind it. -->
  <rect width={width} height={height} fill="url(#{gridId})" opacity="0.55" />

  {#key pathD}
    <path class="land" d={pathD} />

    {#if !quiet}
      <g class="marker" transform="translate({dotXY[0]}, {dotXY[1]})">
        <circle class="halo" r="26" fill="url(#halo)" />
        <circle class="ring ring-a" r="16" />
        <circle class="ring ring-b" r="9" />
        <line class="tick" x1="-24" y1="0" x2="-18" y2="0" />
        <line class="tick" x1="18" y1="0" x2="24" y2="0" />
        <line class="tick" x1="0" y1="-24" x2="0" y2="-18" />
        <line class="tick" x1="0" y1="18" x2="0" y2="24" />
        <circle class="pin" r="4" />
      </g>
    {/if}
  {/key}
</svg>

<style>
  .chart {
    width: 100%;
    height: 100%;
    display: block;
    /*
     * Clip to the viewBox. With `overflow: visible` the marker's halo painted
     * outside the chart, which counted as overflow in the scrolling ancestor
     * and produced a horizontal scrollbar whenever the capital sat near an
     * edge. A slightly clipped halo is invisible; a scrollbar is not.
     */
    overflow: hidden;
  }

  .land {
    fill: color-mix(in oklab, var(--sage) 82%, transparent);
    stroke: var(--sage);
    stroke-width: 1;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 6px 18px rgb(0 0 0 / 0.45));
    animation: draw 700ms ease-out both;
  }

  .quiet .land {
    fill: color-mix(in oklab, var(--sage) 12%, transparent);
    stroke: color-mix(in oklab, var(--sage) 45%, transparent);
    filter: none;
  }

  @keyframes draw {
    from {
      opacity: 0;
      transform: scale(0.985);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .marker {
    animation: land 520ms cubic-bezier(0.2, 0.9, 0.3, 1) both;
    animation-delay: 260ms;
  }

  @keyframes land {
    from {
      opacity: 0;
      scale: 2.4;
    }
    to {
      opacity: 1;
      scale: 1;
    }
  }

  .ring {
    fill: none;
    stroke: var(--brass);
    vector-effect: non-scaling-stroke;
  }
  .ring-a {
    stroke-width: 0.75;
    opacity: 0.45;
  }
  .ring-b {
    stroke-width: 1;
    opacity: 0.75;
  }
  .tick {
    stroke: var(--brass);
    stroke-width: 1;
    opacity: 0.6;
    vector-effect: non-scaling-stroke;
  }
  .pin {
    fill: var(--brass);
    stroke: var(--abyss);
    stroke-width: 1.5;
  }
  .halo {
    animation: breathe 3.2s ease-in-out infinite;
  }
  @keyframes breathe {
    0%,
    100% {
      opacity: 0.55;
    }
    50% {
      opacity: 1;
    }
  }
</style>
