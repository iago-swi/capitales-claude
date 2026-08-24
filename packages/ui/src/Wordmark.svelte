<script lang="ts">
  interface Props {
    label: string;
  }
  let { label }: Props = $props();
</script>

<!-- The brass marker doubles as the logo: same motif, smaller instrument. -->
<div class="wordmark">
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
