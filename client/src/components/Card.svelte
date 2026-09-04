<script lang="ts">
  import type { Card } from "@texas/shared";

  let { card = null }: { card?: Card | null } = $props();
  const symbol = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
  let red = $derived(card?.suit === "diamonds" || card?.suit === "hearts");
</script>

<div class:back={!card} class:red class="card">
  {#if card}
    <span class="corner"><span>{card.rank}</span><span>{symbol[card.suit]}</span></span>
    <span class="pip" aria-hidden="true">{symbol[card.suit]}</span>
  {:else}
    <span class="pip" aria-hidden="true">◆</span>
  {/if}
</div>
