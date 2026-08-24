<script lang="ts">
  interface Props {
    remaining: number;
    total: number;
  }
  let { remaining, total }: Props = $props();

  let fraction = $derived(total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0);
  let seconds = $derived(Math.max(0, remaining / 1000));
  let shown = $derived(Math.ceil(seconds));

  /**
   * Three absolute-time zones rather than percentages: what a player reacts to
   * is "five seconds left", and that stays true if the round length ever moves.
   */
  let zone = $derived(seconds > 10 ? 'safe' : seconds > 5 ? 'warn' : 'danger');
</script>

<div
  class="gauge {zone}"
  role="timer"
  aria-label="{shown} seconds remaining"
>
  <div class="rail">
    <div class="fill" style="--fraction: {fraction}"></div>
    <!-- Zone boundaries, so the drop to orange and red is anticipated. -->
    <span class="notch" style="left: 33.333%"></span>
    <span class="notch" style="left: 66.667%"></span>
  </div>
  <span class="reading">{shown}</span>
</div>

<style>
  .gauge {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    width: 100%;
  }

  .rail {
    position: relative;
    flex: 1;
    height: 12px;
    border: 1px solid var(--grid);
    border-radius: 2px;
    background: color-mix(in oklab, var(--abyss-deep) 70%, transparent);
    overflow: hidden;
  }

  .fill {
    position: absolute;
    inset: 0;
    transform-origin: left;
    transform: scaleX(var(--fraction));
    transition:
      transform 120ms linear,
      background-color 320ms ease;
  }

  .notch {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: color-mix(in oklab, var(--abyss-deep) 85%, transparent);
  }

  .reading {
    min-width: 2.4ch;
    text-align: right;
    font-family: var(--mono);
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
    transition: color 320ms ease;
  }

  .safe .fill {
    background: var(--signal);
  }
  .safe .reading {
    color: var(--signal);
  }

  .warn .fill {
    background: var(--warn);
  }
  .warn .reading {
    color: var(--warn);
  }

  .danger .fill {
    background: var(--alarm);
  }
  .danger .reading {
    color: var(--alarm);
    animation: throb 900ms ease-in-out infinite;
  }

  @keyframes throb {
    50% {
      opacity: 0.45;
    }
  }
</style>
