<script lang="ts">
  import {
    clampAmount,
    currentStreetBet,
    heroForState,
    livePot as livePotForState,
    type PlayerAction,
    type TableState
  } from "@texas/shared";

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

  let amount = $state(20);

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
  let maxCommit = $derived(hero?.chips ?? amount);
  let maxRaiseTo = $derived((hero?.bet ?? 0) + maxCommit);
  let minRaiseTo = $derived(streetBet + tableState.minBet);
  let betInputMin = $derived(Math.min(tableState.minBet, maxCommit));
  let raiseInputMin = $derived(Math.min(minRaiseTo, maxRaiseTo));
  let betAmount = $derived(clampAmount(amount, betInputMin, maxCommit));
  let raiseTo = $derived(clampAmount(amount, raiseInputMin, maxRaiseTo));
  let canRaiseAmount = $derived(
    tableState.canRaise && raiseTo > streetBet && (raiseTo >= minRaiseTo || raiseTo === maxRaiseTo),
  );
  let amountHelp = $derived(
    hasStreetBet && facingBet
      ? `Call is ${tableState.callAmount}. Minimum raise total is ${minRaiseTo}.`
      : hasStreetBet
        ? `No call required. Minimum raise total is ${minRaiseTo}.`
      : maxCommit < tableState.minBet
        ? `Short stack: all in for ${maxCommit}.`
        : `Minimum bet is ${tableState.minBet} chips.`,
  );
  let amountLabel = $derived(hasStreetBet ? "Raise to" : "Bet amount");
  let amountMin = $derived(hasStreetBet ? raiseInputMin : betInputMin);
  let amountMax = $derived(hasStreetBet ? maxRaiseTo : maxCommit);
  let amountValue = $derived(hasStreetBet ? raiseTo : betAmount);

  function setAmount(nextAmount: number): void {
    if (!Number.isFinite(nextAmount)) return;
    amount = clampAmount(nextAmount, amountMin, amountMax);
  }

  function setQuickAmount(fraction: number): void {
    const stack = hero?.chips ?? 0;
    setAmount(
      hasStreetBet
        ? clampAmount(streetBet + Math.ceil(livePot * fraction), minRaiseTo, (hero?.bet ?? 0) + stack)
        : clampAmount(Math.ceil(livePot * fraction), tableState.minBet, stack),
    );
  }

  function setAllIn(): void {
    setAmount(hasStreetBet ? maxRaiseTo : hero?.chips ?? amount);
  }

  function commitBet(): void {
    onaction({ type: "bet", amount: betAmount });
  }

  function commitRaise(): void {
    onaction({ type: "raise", amount: raiseTo });
  }

  $effect(() => {
    if (amount !== amountValue) amount = amountValue;
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
      <button class="danger" disabled={!canAct} onclick={() => onaction({ type: "fold" })}>Fold</button>
      <button class="ghost" disabled={!canAct || facingBet} onclick={() => onaction({ type: "check" })}>Check</button>
      <button disabled={!canAct || hasStreetBet} onclick={commitBet}>Bet</button>
      <button disabled={!canAct || !facingBet} onclick={() => onaction({ type: "call" })}>
        {facingBet ? `Call ${tableState.callAmount}` : "Call"}
      </button>
      <button disabled={!canAct || !hasStreetBet || !canRaiseAmount} onclick={commitRaise}>Raise</button>
    </div>

    <div class="amount-panel">
      <label>
        {amountLabel}
        <input
          type="number"
          min={amountMin}
          max={amountMax}
          step="5"
          disabled={!canAct}
          value={amountValue}
          oninput={(event) => setAmount(event.currentTarget.valueAsNumber)}
        />
      </label>
      <div class="quick-bets" aria-label="Quick bet amounts">
        <button type="button" disabled={!canAct} onclick={() => setQuickAmount(1 / 3)}>1/3 pot</button>
        <button type="button" disabled={!canAct} onclick={() => setQuickAmount(0.5)}>1/2 pot</button>
        <button type="button" disabled={!canAct} onclick={setAllIn}>All in</button>
      </div>
      <span class="action-hint">{amountHelp} Selected: {amountValue}</span>
    </div>
  {/if}
</section>
