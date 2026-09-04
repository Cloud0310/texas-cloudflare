<script lang="ts">
  import type { TableState } from "@texas/shared";
  import { createTable, joinTable } from "../lib/api";

  let { tableId = "", onjoined }: { tableId?: string; onjoined: (detail: { tableId: string; playerId: string; state: TableState }) => void } = $props();

  let name = $state(localStorage.getItem("playerName") ?? "");
  let code = $state("");
  let error = $state("");
  let loadingAction = $state<"create" | "join" | null>(null);
  let loading = $derived(Boolean(loadingAction));

  $effect(() => {
    if (tableId && !code) code = tableId;
  });

  function tableCodeFromInput(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";

    try {
      return new URL(trimmed, window.location.origin).searchParams.get("table")?.trim() || trimmed;
    } catch {
      return trimmed;
    }
  }

  async function createAndJoin() {
    if (loading) return;
    loadingAction = "create";
    error = "";
    try {
      const table = await createTable();
      code = table.tableId;
      await join(table.tableId, "create");
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Could not create table";
    } finally {
      loadingAction = null;
    }
  }

  async function join(tableIdOverride?: string, action: "create" | "join" = "join") {
    if (loading && !tableIdOverride) return;
    const tableCode = tableCodeFromInput(tableIdOverride ?? code);
    if (!tableCode) {
      error = "Enter a table code";
      return;
    }
    loadingAction = action;
    error = "";
    try {
      localStorage.setItem("playerName", name);
      const result = await joinTable(tableCode, name);
      onjoined(result);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Could not join table";
    } finally {
      if (loadingAction === action) loadingAction = null;
    }
  }
</script>

<section class="lobby">
  <div class="hero-panel">
    <p class="eyebrow">Multiplayer Hold'em</p>
    <h1>Texas Hold'em on Cloudflare</h1>
    <p>Start a table, share the code, and play live through a Durable Object powered game room.</p>
  </div>

  <form
    class="join-panel"
    aria-busy={loading}
    onsubmit={(event) => { event.preventDefault(); void join(); }}
  >
    <label>
      Nickname <span class="label-note">optional</span>
      <input bind:value={name} maxlength="20" placeholder="RiverRat" autocomplete="nickname" />
    </label>
    <label>
      Table code or invite link
      <input bind:value={code} placeholder="Paste a code or invite link" />
    </label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="button-row">
      <button type="button" disabled={loading} onclick={() => void createAndJoin()}>
        {loadingAction === "create" ? "Creating..." : "Create table"}
      </button>
      <button type="submit" disabled={loading}>
        {loadingAction === "join" ? "Joining..." : "Join table"}
      </button>
    </div>
  </form>
</section>
