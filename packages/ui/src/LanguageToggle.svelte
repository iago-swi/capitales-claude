<script lang="ts">
  import { LANG_FLAG, LANG_NAME, LANGS, type Lang } from '@capitales/core';

  interface Props {
    lang: Lang;
    onchange: (lang: Lang) => void;
  }
  let { lang, onchange }: Props = $props();
</script>

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
      <span class="flag" aria-hidden="true">{LANG_FLAG[code]}</span>
      <span class="sr-only">{LANG_NAME[code]}</span>
      <span class="code">{code.toUpperCase()}</span>
    </button>
  {/each}
</div>

<style>
  .langs {
    display: inline-flex;
    gap: 0.25rem;
    padding: 0.15rem;
    border-radius: 999px;
    background: color-mix(in oklab, currentColor 8%, transparent);
  }
  .lang {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 32px;
    padding: 0.2rem 0.6rem;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.85rem;
    line-height: 1;
    cursor: pointer;
    opacity: 0.55;
  }
  .lang:hover {
    opacity: 0.85;
  }
  .lang.active {
    opacity: 1;
    background: color-mix(in oklab, currentColor 14%, transparent);
    font-weight: 600;
  }
  .flag {
    font-size: 1.05rem;
  }
  /* Emoji flags do not render on Windows, so the code carries the meaning. */
  .code {
    letter-spacing: 0.04em;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
