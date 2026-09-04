<script lang="ts">
  import {
    heroForState,
    livePot as livePotForState,
    type PlayerAction,
    type PublicPlayer,
    type TableState
  } from "@texas/shared";
  import ActionBar from "./ActionBar.svelte";
  import Card from "./Card.svelte";
  import PlayerSeat from "./PlayerSeat.svelte";

  const MAX_SEATS = 6;
  const SEAT_SLOTS_BY_TOTAL: Record<number, readonly number[]> = {
    0: [],
    1: [0],
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 2, 3, 4],
    5: [0, 1, 2, 4, 5],
    6: [0, 1, 2, 3, 4, 5],
  };

  type SeatedPlayer = {
    player: PublicPlayer;
    slot: number;
  };

  let {
    tableState,
    playerId,
    notice = "",
    connectionStatus,
    onaction,
    onstart,
    onnextHand,
    onleave
  }: {
    tableState: TableState;
    playerId: string;
    notice?: string;
    connectionStatus: "connecting" | "connected" | "reconnecting" | "offline";
    onaction: (action: PlayerAction) => void;
    onstart: () => void;
    onnextHand: () => void;
    onleave: () => void;
  } = $props();

  let hero = $derived(heroForState(tableState, playerId));
  let seatedPlayers = $derived.by((): SeatedPlayer[] => {
    const heroIndex = hero ? tableState.players.indexOf(hero) : -1;
    const orderedPlayers =
      heroIndex < 0
        ? tableState.players
        : [...tableState.players.slice(heroIndex), ...tableState.players.slice(0, heroIndex)];
    const players = orderedPlayers.slice(0, MAX_SEATS);
    const slots = SEAT_SLOTS_BY_TOTAL[players.length] ?? SEAT_SLOTS_BY_TOTAL[MAX_SEATS];

    return players.map((player, index) => ({ player, slot: slots[index] ?? index }));
  });
  let livePot = $derived(livePotForState(tableState));
  let shareUrl = $derived(`${window.location.origin}${window.location.pathname}?table=${tableState.id}`);
  let copyStatus = $state("");

  function active(player: PublicPlayer): boolean {
    return tableState.currentPlayerId === player.id;
  }

  async function copyInvite(): Promise<void> {
    copyStatus = "";
    try {
      await navigator.clipboard.writeText(shareUrl);
      copyStatus = "Copied";
    } catch {
      copyStatus = "Copy failed";
    }
  }
</script>

<section class="table-page">
  <header class="status-bar">
    <div>
      <span class="eyebrow">Table {tableState.id.slice(0, 8)}</span>
      <h1>{tableState.phase}</h1>
    </div>
    <div class="status-actions">
      <span class:online={connectionStatus === "connected"} class="connection-status">{connectionStatus}</span>
      <button class="ghost" onclick={() => void copyInvite()}>{copyStatus || "Copy invite"}</button>
      <button class="ghost" onclick={onleave}>Leave</button>
    </div>
  </header>

  <div class="felt">
    {#each seatedPlayers as seat (seat.player.id)}
      <div class={`seat-slot seat-slot-${seat.slot}`}>
        <PlayerSeat
          player={seat.player}
          hero={seat.player.id === playerId}
          active={active(seat.player)}
        />
      </div>
    {/each}

    <div class="board-zone">
      {#if livePot > 0}
        <div class="pot-pill"><span>Pot</span><strong>{livePot}</strong></div>
      {/if}
      <div class="community">
        {#each Array(5) as _, index}
          <Card card={tableState.community[index] ?? null} />
        {/each}
      </div>
      <p>{tableState.message}</p>
      {#if notice}<p class="error">{notice}</p>{/if}
      {#if tableState.winners.length}
        <div class="winners">
          {#each tableState.winners as winner}
            <span>{winner.name}: +{winner.amount} ({winner.description})</span>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <ActionBar
    {tableState}
    {playerId}
    onaction={onaction}
    onstart={onstart}
    onnextHand={onnextHand}
  />
</section>
