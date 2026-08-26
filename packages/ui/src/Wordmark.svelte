<script lang="ts">
  interface Props {
    label: string;
    /**
     * Called on every press. The logo is the way into the credits — seven of
     * them — so it has to notice being pressed without becoming a control.
     */
    onpress?: (() => void) | undefined;
    /** Set once a run of presses is clearly deliberate, to admit as much. */
    stirring?: boolean;
  }
  let { label, onpress = undefined, stirring = false }: Props = $props();
</script>

<!--
  The brass marker doubles as the logo: same motif, smaller instrument.

  Deliberately not a button. It does nothing a keyboard user needs, and putting
  a focus stop in the header that announces nothing would cost every visitor
  something to hide a joke from most of them.
-->
<div
  class="wordmark"
  class:stirring
  onpointerdown={onpress}
  aria-hidden={onpress ? undefined : undefined}
>
  <span class="bead" aria-hidden="true"></span>
  <span class="name">{label}</span>
</div>

<style>
  .wordmark {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
  }
  .bead {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--brass);
    box-shadow: 0 0 0 4px color-mix(in oklab, var(--brass) 22%, transparent);
    transition: box-shadow 160ms ease-out;
  }

  /*
   * The only tell, and it arrives late. Half way through the run the bead's
   * halo widens — enough that someone already pressing knows they are being
   * heard, and nothing at all to someone who pressed once.
   */
  .wordmark.stirring .bead {
    box-shadow: 0 0 0 8px color-mix(in oklab, var(--brass) 30%, transparent);
  }
  .name {
    font-family: var(--mono);
    font-size: 0.78rem;
    font-weight: 500;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--paper);
  }
</style>
