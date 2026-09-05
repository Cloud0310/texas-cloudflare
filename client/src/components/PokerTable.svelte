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
  import TableStatusMenu from "./TableStatusMenu.svelte";

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
  let actionPrompt = $derived(
    tableState.currentPlayerId === playerId
      ? tableState.callAmount > 0
        ? `Your turn · Call ${tableState.callAmount} to stay in`
        : "Your turn"
      : tableState.message,
  );

  function active(player: PublicPlayer): boolean {
    return tableState.currentPlayerId === player.id;
  }
</script>

<section class="table-page">
  <header class="table-header">
    <div class="table-badge">
      <span aria-hidden="true">♠</span>
      <div>
        <h1>{tableState.phase}</h1>
        <small>Hand {tableState.handNumber}</small>
      </div>
    </div>
    <TableStatusMenu {tableState} {connectionStatus} {onleave} />
  </header>

  <div class="felt">
    <div class="felt-grid">
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
        <span class="table-wordmark" aria-hidden="true">TEXAS <span>HOLD’EM</span></span>
        {#if livePot > 0}
          <div class="pot-pill"><span>Pot</span><strong>{livePot}</strong></div>
        {/if}
        <div class="community">
          {#each Array(5) as _, index}
            <Card card={tableState.community[index] ?? null} />
          {/each}
        </div>
        {#if tableState.winners.length}
          <button type="button" class="result-trigger ghost" popovertarget="hand-results">View hand result ↗</button>
        {:else}
          <p title={tableState.message}>{tableState.message}</p>
        {/if}
      </div>
    </div>
  </div>

  {#if notice}<p class="table-notice" role="alert">{notice}</p>{/if}

  <footer class="action-dock">
    <span class="turn-note" title={actionPrompt}>{actionPrompt}</span>
    <ActionBar {tableState} {playerId} {onaction} {onstart} {onnextHand} />
  </footer>

  {#if tableState.winners.length}
    <div id="hand-results" popover="auto" role="dialog" aria-label="Hand results" class="hand-results">
      <header>
        <h2>Hand {tableState.handNumber} results</h2>
        <button type="button" class="ghost" popovertarget="hand-results" popovertargetaction="hide" aria-label="Close results">×</button>
      </header>
      <p>{tableState.message}</p>
      <ul>
        {#each tableState.winners as winner}
          <li>
            <strong>{winner.name} <span>+{winner.amount}</span></strong>
            <small>{winner.description}</small>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</section>
