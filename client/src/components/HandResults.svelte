<script lang="ts">
  import type { TableState } from "@texas/shared";
  import Card from "./Card.svelte";

  let { tableState }: { tableState: TableState } = $props();

  let dialog: HTMLDialogElement;
  let result = $state.raw<TableState | null>(null);

  $effect(() => {
    if (result && result.id !== tableState.id) {
      dialog.close();
      result = null;
    }
    if (
      tableState.phase === "complete" &&
      tableState.winners.length > 0 &&
      (result?.id !== tableState.id || result?.handNumber !== tableState.handNumber)
    ) {
      // Keep the completed snapshot when another player starts the next hand.
      result = tableState;
    }
  });

  $effect(() => {
    // Open after the result has rendered, once per hand. Presence updates must
    // not reopen a result the player has already dismissed.
    if (result && dialog) dialog.showModal();
  });
</script>

{#if result}
  <button
    type="button"
    class="result-trigger ghost"
    aria-haspopup="dialog"
    aria-controls="hand-results"
    onclick={() => dialog.showModal()}
  >{tableState.phase === "complete" ? "Hand result" : "Last result"}</button>
{/if}

<dialog bind:this={dialog} id="hand-results" aria-labelledby="hand-results-title" class="hand-results">
  {#if result}
    <header>
      <h2 id="hand-results-title">Hand {result.handNumber} results</h2>
      <button type="button" class="ghost" onclick={() => dialog.close()} aria-label="Close results">×</button>
    </header>
    <p>{result.message}</p>
    {#if result.community.length}
      <div class="result-board" aria-label="Community cards">
        {#each result.community as card}<Card {card} />{/each}
      </div>
    {/if}
    <ul>
      {#each result.winners as winner (winner.playerId)}
        <li>
          <strong>{winner.name} <span>+{winner.amount} chips</span></strong>
          <small>{winner.description}</small>
        </li>
      {/each}
    </ul>
    <button type="button" class="result-dismiss" onclick={() => dialog.close()}>Back to table</button>
  {/if}
</dialog>
