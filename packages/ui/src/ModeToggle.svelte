<script lang="ts">
  import { MODES, type Mode } from '@capitales/core';

  interface Props {
    mode: Mode;
    /** Label for each mode, supplied by the app so this stays language-free. */
    label: (mode: Mode) => string;
    onchange: (mode: Mode) => void;
  }
  let { mode, label, onchange }: Props = $props();
</script>

<!--
  Deliberately the same control as the language toggle: segmented, mono, brass
  when active. Two settings that look alike behave alike, and neither needs
  explaining once you have met the other.
-->
<div class="modes" role="group">
  {#each MODES as code (code)}
    <button
      type="button"
      class="mode"
      class:active={code === mode}
      aria-pressed={code === mode}
      onclick={() => onchange(code)}
    >
      {label(code)}
    </button>
  {/each}
</div>

<style>
  .modes {
    display: inline-flex;
    border: 1px solid var(--grid);
    border-radius: 3px;
    overflow: hidden;
  }
  .mode {
    min-width: 8.5rem;
    padding: 0.6rem 1.2rem;
    border: 0;
    background: transparent;
    color: var(--dim);
    font-family: var(--mono);
    font-size: 0.76rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    line-height: 1;
    cursor: pointer;
    transition:
      color 140ms ease,
      background 140ms ease;
  }
  .mode + .mode {
    border-left: 1px solid var(--grid);
  }
  .mode:hover {
    color: var(--paper);
  }
  .mode.active {
    background: var(--brass);
    color: var(--abyss);
    font-weight: 500;
  }

  @media (max-width: 480px) {
    .modes {
      width: 100%;
    }
    .mode {
      flex: 1;
      min-width: 0;
      padding: 0.7rem 0.5rem;
    }
  }
</style>
