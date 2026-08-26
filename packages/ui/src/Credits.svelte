<script lang="ts">
  import { CREDITS, CREDITS_BACK, nextCredit } from './credits.js';

  interface Props {
    /** Leaves the credits and returns to the title. */
    onback: () => void;
  }
  let { onback }: Props = $props();

  /**
   * Advanced by hand only.
   *
   * It used to move on by itself every six seconds, which sounds friendly and
   * is not: two of these captions take longer than that to read, so the screen
   * kept pulling the text away mid-sentence. Nothing here is urgent, and the
   * reader is the one who knows when they have finished.
   */
  let index = $state(0);

  let person = $derived(CREDITS[index]);
</script>

<!--
  No wordmark, no language toggle, no footer: the surrounding chrome is hidden
  for this screen. What is left is three faces, what each of them did, and the
  way out. A page you have to knock seven times to reach should feel like a
  different room, not the same room with a panel swapped in.
-->
<div class="credits">
  <p class="heading mono">{person?.heading}</p>

  <!--
    One bubble, cross-fading. Every portrait is cropped to the same square and
    masked to the same circle, so nothing shifts as they change: the faces are
    different sizes in their originals and would otherwise jump about.
  -->
  <button
    class="bubble"
    onclick={() => (index = nextCredit(index, CREDITS.length))}
    aria-label={person?.name}
  >
    {#each CREDITS as who, i (who.name)}
      <img
        class="portrait"
        class:showing={i === index}
        src={who.photo}
        alt={who.name}
        aria-hidden={i === index ? undefined : 'true'}
      />
    {/each}
  </button>

  <!-- Fixed height, so the shortest caption does not let the dots jump up. -->
  <p class="caption">
    {#key index}
      <span class="line">{person?.caption}</span>
    {/key}
  </p>

  <div class="dots" role="tablist" aria-label="Crédits">
    {#each CREDITS as who, i (who.name)}
      <button
        class="dot"
        class:on={i === index}
        role="tab"
        aria-selected={i === index}
        aria-label={who.name}
        onclick={() => (index = i)}
      ></button>
    {/each}
  </div>

  <button class="back" onclick={onback}>{CREDITS_BACK}</button>
</div>

<style>
  .credits {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.1rem;
    width: 100%;
  }

  /*
   * Restated rather than borrowed. `.eyebrow` is scoped to App.svelte, so a
   * component that merely names the class gets only the global `.mono` and
   * quietly loses the colour every other eyebrow in the app has.
   */
  .heading {
    margin: 0;
    color: var(--sage);
  }

  .bubble {
    position: relative;
    width: 132px;
    height: 132px;
    padding: 0;
    border: 1px solid var(--brass-dim);
    border-radius: 50%;
    background: var(--shelf);
    overflow: hidden;
    cursor: pointer;
    box-shadow: 0 0 0 6px color-mix(in oklab, var(--brass) 12%, transparent);
  }

  .bubble:hover,
  .bubble:focus-visible {
    box-shadow: 0 0 0 8px color-mix(in oklab, var(--brass) 22%, transparent);
  }

  .portrait {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition: opacity 420ms ease-in-out;
  }

  .portrait.showing {
    opacity: 1;
  }

  .caption {
    /*
     * Three lines' worth, held whatever the caption needs. Without it the dots
     * climb and drop as the faces change, which is far more distracting than
     * the empty space it costs.
     */
    min-height: 4.2em;
    margin: 0;
    /*
     * The same treatment as the subtitle on the title screen, because it is
     * the same kind of text: a sentence of prose under a heading. It was sage
     * at whatever size it inherited, which is the palette's accent colour for
     * small technical labels — coordinates, counters, hints — and read as a
     * different voice from the rest of the app.
     */
    max-width: 34ch;
    color: var(--dim);
    font-size: 1rem;
    line-height: 1.45;
    text-wrap: balance;
  }

  .line {
    display: inline-block;
    animation: caption-in 380ms ease-out both;
  }

  @keyframes caption-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dots {
    display: flex;
    gap: 0.5rem;
  }

  /*
   * The dots carry more weight now that nothing moves on its own: they are the
   * only sign that there are two more faces behind this one. Hence a size that
   * can be hit with a thumb rather than the 9px mark they show.
   */
  .dot {
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: none;
    cursor: pointer;
    display: grid;
    place-items: center;
  }

  .dot::after {
    content: '';
    width: 9px;
    height: 9px;
    border: 1px solid var(--brass-dim);
    border-radius: 50%;
    transition:
      background 200ms ease-out,
      border-color 200ms ease-out;
  }

  .dot.on::after {
    background: var(--brass);
    border-color: var(--brass);
  }

  .dot:hover:not(.on)::after,
  .dot:focus-visible::after {
    border-color: var(--brass);
  }

  /*
   * The same brass button as "Commencer le relevé" on the title screen. With
   * the header and footer gone this is the only way out of the page, so it is
   * dressed as the thing to press rather than as an afterthought — smaller
   * than the title's call to action, because leaving is not the point of the
   * page the way starting is the point of the other one.
   */
  .back {
    margin-top: 0.4rem;
    padding: 0.62rem 1.6rem;
    border: 0;
    border-radius: 3px;
    background: var(--brass);
    color: var(--abyss);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition:
      transform 160ms cubic-bezier(0.2, 0.9, 0.3, 1),
      box-shadow 160ms ease;
  }

  .back:hover,
  .back:focus-visible {
    transform: translateY(-2px);
    box-shadow: 0 10px 26px color-mix(in oklab, var(--brass) 28%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .portrait,
    .line,
    .back {
      transition: none;
      animation: none;
    }
  }
</style>
