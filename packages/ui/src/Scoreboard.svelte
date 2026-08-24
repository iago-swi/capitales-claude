<script lang="ts">
  interface Props {
    score: number;
    streak: number;
    questionNumber: number;
    questionCount: number;
  }
  let { score, streak, questionNumber, questionCount }: Props = $props();
</script>

<div class="scoreboard">
  <span class="progress">{questionNumber} / {questionCount}</span>
  <span class="score">{score}</span>
  {#if streak >= 2}
    <span class="streak">🔥 {streak}</span>
  {/if}
</div>

<style>
  .scoreboard {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    font-variant-numeric: tabular-nums;
  }
  .progress {
    opacity: 0.7;
  }
  .score {
    font-size: 1.5rem;
    font-weight: 700;
  }
</style>
