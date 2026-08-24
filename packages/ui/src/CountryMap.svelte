<script lang="ts">
  interface Props {
    pathD: string;
    dotXY: [number, number];
    width: number;
    height: number;
  }
  let { pathD, dotXY, width, height }: Props = $props();
</script>

<svg
  class="country-map"
  viewBox="0 0 {width} {height}"
  role="img"
  aria-label="Country outline with its capital marked"
>
  <path d={pathD} class="outline" />
  <circle cx={dotXY[0]} cy={dotXY[1]} r="7" class="dot-halo" />
  <circle cx={dotXY[0]} cy={dotXY[1]} r="4" class="dot" />
</svg>

<style>
  .country-map {
    width: 100%;
    height: 100%;
    display: block;
  }
  .outline {
    fill: color-mix(in oklab, currentColor 12%, transparent);
    stroke: currentColor;
    stroke-width: 1.25;
    stroke-linejoin: round;
    /* Without this the stroke scales with the viewBox, so a country zoomed in
       renders a hairline and one zoomed out renders a blob. */
    vector-effect: non-scaling-stroke;
  }
  .dot-halo {
    fill: color-mix(in oklab, tomato 35%, transparent);
  }
  .dot {
    fill: tomato;
    stroke: white;
    stroke-width: 1.5;
  }
</style>
