<script lang="ts">
  import { LANG_NAME, LANGS, type Lang } from '@capitales/core';

  interface Props {
    lang: Lang;
    onchange: (lang: Lang) => void;
  }
  let { lang, onchange }: Props = $props();
</script>

<!--
  Language codes, not flag emoji. Windows renders regional-indicator pairs as
  bare letters ("GB", "FR") rather than flags, so the emoji would only ever be
  a worse version of the code it falls back to.
-->
<div class="langs" role="group" aria-label="Language">
  {#each LANGS as code (code)}
    <button
      type="button"
      class="lang"
      class:active={code === lang}
      aria-pressed={code === lang}
      title={LANG_NAME[code]}
      onclick={() => onchange(code)}
    >
      <span class="sr-only">{LANG_NAME[code]}</span>
      <span aria-hidden="true">{code.toUpperCase()}</span>
    </button>
  {/each}
</div>

<style>
  .langs {
    display: inline-flex;
    border: 1px solid var(--grid);
    border-radius: 3px;
    overflow: hidden;
  }
  .lang {
    padding: 0.35rem 0.65rem;
    border: 0;
    background: transparent;
    color: var(--dim);
    font-family: var(--mono);
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    line-height: 1;
    cursor: pointer;
    transition:
      color 140ms ease,
      background 140ms ease;
  }
  .lang + .lang {
    border-left: 1px solid var(--grid);
  }
  .lang:hover {
    color: var(--paper);
  }
  .lang.active {
    background: var(--brass);
    color: var(--abyss);
    font-weight: 500;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>
