<script lang="ts">
  import type { Card } from "@texas/shared";

  let { card = null }: { card?: Card | null } = $props();
  const symbol = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
  let red = $derived(card?.suit === "diamonds" || card?.suit === "hearts");
</script>

<div class:back={!card} class:red class="card">
  {#if card}
    <span>{card.rank}</span>
    <strong>{symbol[card.suit]}</strong>
  {:else}
    <span>◆</span>
  {/if}
</div>
