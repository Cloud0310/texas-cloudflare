<script lang="ts">
  import type { PublicPlayer } from "@texas/shared";
  import Card from "./Card.svelte";

  let { player, active = false, hero = false }: { player: PublicPlayer; active?: boolean; hero?: boolean } = $props();
</script>

<article class:active class:hero class:folded={player.folded} class="seat">
  <div class="seat-info">
    <div class="name-line">
      <strong>{player.name}</strong>
      {#if player.dealer}<span>D</span>{/if}
      {#if player.smallBlind}<span>SB</span>{/if}
      {#if player.bigBlind}<span>BB</span>{/if}
      {#if player.allIn}<span>ALL IN</span>{/if}
    </div>
    <small>{player.connected ? "online" : "away"} · {player.chips} chips · Buy-in {player.buyIns}</small>
    {#if player.bet > 0}<small>Bet {player.bet}</small>{/if}
  </div>
  <div class="mini-hand">
    {#each player.cards as card}
      <Card {card} />
    {/each}
  </div>
</article>
