<script lang="ts">
  interface Props {
    pathD: string;
    /** Pixel position of the real capital. */
    dotXY: [number, number];
    width: number;
    height: number;
    /**
     * Ambient styling: a faint outline, for the title screen. It no longer
     * implies hiding the marker — on the title the marker is the point, since
     * its presence or absence is what previews the mode.
     */
    quiet?: boolean;
    /**
     * Hides the real marker until `revealed`. This is what makes `place` mode a
     * question rather than a reading exercise.
     */
    hideMarker?: boolean;
    /** Where the player put their marker, in pixels. */
    guessXY?: [number, number] | null;
    /** Show the answer: real marker, the guess, and the line between them. */
    revealed?: boolean;
    /**
     * Pixel radius of the on-target zone, drawn around the capital on reveal.
     *
     * The results screen counts drops that landed "on target", and until this
     * was drawn that phrase named something the player could never see. The
     * circle is the whole explanation: inside it the streak survives.
     */
    targetPx?: number | null;
    /** Called with pixel coordinates inside the viewBox when the map is used. */
    onpick?: ((x: number, y: number) => void) | undefined;
  }
  let {
    pathD,
    dotXY,
    width,
    height,
    quiet = false,
    hideMarker = false,
    guessXY = null,
    revealed = false,
    targetPx = null,
    onpick = undefined,
  }: Props = $props();

  let gridId = $derived(`grat-${width}x${height}`);
  let interactive = $derived(onpick !== undefined);
  let showTruth = $derived(!hideMarker || revealed);

  /**
   * Converts a pointer event into viewBox coordinates.
   *
   * The SVG is scaled to its container, so client pixels are not viewBox units.
   * Going through the element's own bounding box keeps the marker under the
   * finger at any size, without the caller needing to know the scale.
   */
  function pickFrom(event: PointerEvent): void {
    if (!onpick) return;
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    onpick(
      ((event.clientX - rect.left) / rect.width) * width,
      ((event.clientY - rect.top) / rect.height) * height,
    );
  }
</script>

<svg
  class="chart"
  class:quiet
  class:interactive
  viewBox="0 0 {width} {height}"
  role={interactive ? 'application' : 'img'}
  aria-label="Country outline with its capital marked"
  onpointerdown={interactive ? pickFrom : undefined}
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
  {/key}

  <!-- The target underneath everything, so it reads as ground, not as a mark. -->
  {#if revealed && targetPx}
    <circle
      class="target"
      cx={dotXY[0]}
      cy={dotXY[1]}
      r={targetPx}
    />
  {/if}

  <!-- The line first, so both markers sit on top of it. -->
  {#if revealed && guessXY}
    <line
      class="miss"
      x1={guessXY[0]}
      y1={guessXY[1]}
      x2={dotXY[0]}
      y2={dotXY[1]}
    />
  {/if}

  {#if guessXY}
    <g class="guess" transform="translate({guessXY[0]}, {guessXY[1]})">
      <circle class="guess-ring" r="11" />
      <path class="guess-cross" d="M-6 0H6M0 -6V6" />
    </g>
  {/if}

  {#if showTruth}
    {#key pathD}
      <g class="marker" class:late={revealed}>
        <g transform="translate({dotXY[0]}, {dotXY[1]})">
          <circle class="halo" r="26" fill="url(#halo)" />
          <circle class="ring ring-a" r="16" />
          <circle class="ring ring-b" r="9" />
          <line class="tick" x1="-24" y1="0" x2="-18" y2="0" />
          <line class="tick" x1="18" y1="0" x2="24" y2="0" />
          <line class="tick" x1="0" y1="-24" x2="0" y2="-18" />
          <line class="tick" x1="0" y1="18" x2="0" y2="24" />
          <circle class="pin" r="4" />
        </g>
      </g>
    {/key}
  {/if}
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

  .target {
    fill: var(--alarm);
    fill-opacity: 0.1;
    stroke: var(--alarm);
    stroke-width: 1.75;
    stroke-dasharray: 7 5;
    /*
     * Shown briefly and then gone. Long enough to answer "what is the target?"
     * on the question where you first wonder, short enough that it never gets
     * in the way of reading the miss line on the questions after that. The
     * placing reveal lasts 2200ms, so this clears the screen well before the
     * next country arrives.
     */
    animation: target-flash 1500ms ease-out both;
    transform-box: fill-box;
    transform-origin: center;
  }

  @keyframes target-flash {
    0% {
      opacity: 0;
      transform: scale(0.86);
    }
    12% {
      opacity: 1;
      transform: scale(1);
    }
    60% {
      opacity: 1;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(1);
    }
  }

  /*
   * Still brief, just not moving. Dropping the animation entirely would leave
   * the circle on screen for ever, which is the opposite of what was asked.
   */
  @media (prefers-reduced-motion: reduce) {
    .target {
      animation: target-fade 1500ms ease-out both;
    }
  }

  @keyframes target-fade {
    0%,
    12% {
      opacity: 0;
    }
    13%,
    60% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  .chart.interactive {
    cursor: crosshair;
    /* Stop the browser panning or zooming instead of registering the drop. */
    touch-action: none;
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
  /* On the title screen the marker is preview, not subject: present enough to
     read the mode from, quiet enough not to compete with the headline. */
  .quiet .marker {
    opacity: 0.75;
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
  /* Revealed after a guess: no delay, the player is waiting for it. */
  .marker.late {
    animation-delay: 0ms;
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

  /* The player's marker is deliberately a different instrument from the
     brass benchmark: pale, hollow, a sight rather than a survey mark. */
  .guess-ring {
    fill: color-mix(in oklab, var(--paper) 12%, transparent);
    stroke: var(--paper);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }
  .guess-cross {
    stroke: var(--paper);
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }
  .guess {
    animation: drop 260ms cubic-bezier(0.2, 0.9, 0.3, 1) both;
  }
  @keyframes drop {
    from {
      opacity: 0;
      scale: 1.8;
    }
    to {
      opacity: 1;
      scale: 1;
    }
  }

  .miss {
    stroke: color-mix(in oklab, var(--paper) 55%, transparent);
    stroke-width: 1.25;
    stroke-dasharray: 4 4;
    vector-effect: non-scaling-stroke;
    animation: reach 420ms ease-out both;
  }
  @keyframes reach {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
