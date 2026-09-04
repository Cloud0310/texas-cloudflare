<script lang="ts">
  import {
    currentStreetBet,
    heroForState,
    livePot as livePotForState,
    type PlayerAction,
    type TableState
  } from "@texas/shared";
  import AmountPanel from "./AmountPanel.svelte";

  type AmountAction = "bet" | "raise";

  let {
    tableState,
    playerId,
    onaction,
    onstart,
    onnextHand
  }: {
    tableState: TableState;
    playerId: string;
    onaction: (action: PlayerAction) => void;
    onstart: () => void;
    onnextHand: () => void;
  } = $props();

  let amountAction = $state<AmountAction | null>(null);

  let isTurn = $derived(tableState.currentPlayerId === playerId);
  let facingBet = $derived(tableState.callAmount > 0);
  let waitingForPlayers = $derived(tableState.phase === "waiting" && tableState.players.length < 2);
  let canStart = $derived(tableState.phase === "waiting" && tableState.players.length >= 2);
  let complete = $derived(tableState.phase === "complete");
  let hero = $derived(heroForState(tableState, playerId));
  let currentActor = $derived(
    tableState.players.find((player) => player.id === tableState.currentPlayerId),
  );
  let canAct = $derived(isTurn && Boolean(hero) && !hero?.folded && !hero?.allIn && (hero?.chips ?? 0) > 0);
  let livePot = $derived(livePotForState(tableState));
  let streetBet = $derived(currentStreetBet(tableState, currentActor));
  let hasStreetBet = $derived(streetBet > 0);
  let maxCommit = $derived(hero?.chips ?? 0);
  let maxRaiseTo = $derived((hero?.bet ?? 0) + maxCommit);
  let minRaiseTo = $derived(streetBet + tableState.minBet);
  let betInputMin = $derived(Math.min(tableState.minBet, maxCommit));
  let raiseInputMin = $derived(Math.min(minRaiseTo, maxRaiseTo));
  let canRaise = $derived(tableState.canRaise && maxRaiseTo > streetBet);

  function toggleAmountPanel(action: AmountAction): void {
    amountAction = amountAction === action ? null : action;
  }

  function commitAction(action: PlayerAction): void {
    amountAction = null;
    onaction(action);
  }

  function commitAmount(amount: number): void {
    const action = amountAction;
    amountAction = null;
    if (action) onaction({ type: action, amount });
  }

  $effect(() => {
    if (
      !canAct ||
      (amountAction === "bet" && hasStreetBet) ||
      (amountAction === "raise" && (!hasStreetBet || !canRaise))
    )
      amountAction = null;
  });
</script>

<section class="action-bar">
  {#if waitingForPlayers}
    <span class="action-hint">Waiting for another player. Copy the invite from the table header.</span>
  {:else if canStart}
    <button onclick={onstart}>Start hand</button>
  {:else if complete}
    <button onclick={onnextHand}>Next hand</button>
  {:else}
    <div class="action-menu" aria-label="Poker actions">
      <button class="danger" disabled={!canAct} onclick={() => commitAction({ type: "fold" })}>Fold</button>
      <button class="ghost" disabled={!canAct || facingBet} onclick={() => commitAction({ type: "check" })}>Check</button>
      <button
        class:active-amount={amountAction === "bet"}
        disabled={!canAct || hasStreetBet}
        aria-controls="amount-panel"
        aria-expanded={amountAction === "bet"}
        onclick={() => toggleAmountPanel("bet")}
      >Bet</button>
      <button disabled={!canAct || !facingBet} onclick={() => commitAction({ type: "call" })}>
        {facingBet ? `Call ${tableState.callAmount}` : "Call"}
      </button>
      <button
        class:active-amount={amountAction === "raise"}
        disabled={!canAct || !hasStreetBet || !canRaise}
        aria-controls="amount-panel"
        aria-expanded={amountAction === "raise"}
        onclick={() => toggleAmountPanel("raise")}
      >Raise</button>
    </div>

    {#if amountAction}
      <AmountPanel
        action={amountAction}
        minimum={amountAction === "raise" ? raiseInputMin : betInputMin}
        maximum={amountAction === "raise" ? maxRaiseTo : maxCommit}
        pot={livePot}
        currentBet={streetBet}
        onconfirm={commitAmount}
        oncancel={() => (amountAction = null)}
      />
    {/if}
  {/if}
</section>
