<script lang="ts">
  import type { Lang } from '@capitales/core';
  import { CREDITS, initialsOf } from './credits.js';

  interface Props {
    lang: Lang;
    title: string;
  }
  let { lang, title }: Props = $props();
</script>

<div class="credits">
  <p class="eyebrow mono">{title}</p>

  <ul>
    {#each CREDITS as person (person.name)}
      <li>
        {#if person.photo}
          <img class="portrait" src={person.photo} alt="" />
        {:else}
          <!-- An entry can exist before its portrait does, and still look
               deliberate rather than broken. -->
          <span class="portrait initials" aria-hidden="true">
            {initialsOf(person.name)}
          </span>
        {/if}

        <span class="who">
          <span class="name">{person.name}</span>
          <span class="role mono">{person.role[lang]}</span>
          <span class="quip">{person.quip[lang]}</span>
        </span>
      </li>
    {/each}
  </ul>
</div>

<style>
  .credits {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.2rem;
    width: 100%;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: min(32rem, 100%);
  }

  li {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.85rem 1rem;
    border: 1px solid var(--grid);
    border-radius: 4px;
    background: color-mix(in oklab, var(--shelf) 55%, transparent);
    text-align: left;
  }

  .portrait {
    flex: none;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid var(--brass-dim);
  }

  .initials {
    display: grid;
    place-items: center;
    font-family: var(--mono);
    font-size: 1rem;
    letter-spacing: 0.08em;
    color: var(--brass);
    background: color-mix(in oklab, var(--brass) 14%, transparent);
  }

  .who {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  .name {
    color: var(--paper);
    font-weight: 600;
  }

  .role {
    font-size: 0.68rem;
    color: var(--dim);
  }

  .quip {
    font-size: 0.9rem;
    color: var(--sage);
    text-wrap: balance;
  }

  /* Below this the disc and three lines of text stop fitting side by side. */
  @media (max-width: 460px) {
    li {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .who {
      align-items: center;
    }
  }
</style>
