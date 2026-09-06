<script lang="ts">
  import { livePot, type TableState } from "@texas/shared";

  let { tableState, connectionStatus, onleave }: {
    tableState: TableState;
    connectionStatus: "connecting" | "connected" | "reconnecting" | "offline";
    onleave: () => void;
  } = $props();

  let menu: HTMLDivElement;
  let copyStatus = $state("");
  let showInvite = $state(false);
  let shareUrl = $derived(`${window.location.origin}${window.location.pathname}?table=${tableState.id}`);

  async function copyInvite(): Promise<void> {
    copyStatus = "";
    showInvite = false;
    try {
      await navigator.clipboard.writeText(shareUrl);
      copyStatus = "Invite link copied.";
    } catch {
      showInvite = true;
      copyStatus = "Select the link below to copy it.";
    }
  }
</script>

<button class="menu-trigger ghost" type="button" popovertarget="table-status-menu" aria-haspopup="dialog" aria-label={`Table menu: ${connectionStatus}`}>
  <span class:online={connectionStatus === "connected"} class:offline={connectionStatus === "offline"} class="live-dot" aria-hidden="true"></span>
  <span>Table menu</span>
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
</button>

<div bind:this={menu} id="table-status-menu" popover="auto" role="dialog" aria-label="Table details" class="table-menu">
  <header>
    <div><span class="eyebrow">Your table</span><h2>{tableState.id.slice(0, 8)}</h2></div>
    <button class="ghost dismiss" type="button" popovertarget="table-status-menu" popovertargetaction="hide" aria-label="Close table menu">×</button>
  </header>
  <p class:online={connectionStatus === "connected"} class="connection" role="status">{connectionStatus}</p>
  <dl>
    <div><dt>Hand</dt><dd>#{tableState.handNumber}</dd></div>
    <div><dt>Round</dt><dd>{tableState.phase}</dd></div>
    <div><dt>Players</dt><dd>{tableState.players.length} / 6</dd></div>
    <div><dt>Live pot</dt><dd>{livePot(tableState)} chips</dd></div>
  </dl>
  <div class="menu-actions">
    <button type="button" onclick={() => void copyInvite()}>Copy invite <span aria-hidden="true">↗</span></button>
    {#if copyStatus}<p class="copy-status" role="status">{copyStatus}</p>{/if}
    {#if showInvite}<input aria-label="Invite link" readonly value={shareUrl} onclick={(event) => event.currentTarget.select()} />{/if}
    <button type="button" class="ghost leave-table" onclick={() => { menu.hidePopover(); onleave(); }}>Leave table <span aria-hidden="true">↪</span></button>
  </div>
</div>

<style>
  .menu-trigger { display: inline-flex; align-items: center; justify-content: center; gap: 9px; min-block-size: 44px; padding: 8px 13px; white-space: nowrap; border-color: var(--line); background: #101b16ee; font-size: 14px; }
  .live-dot { inline-size: 6px; block-size: 6px; flex: 0 0 6px; border-radius: 50%; background: var(--gold); }
  .live-dot.online { background: #8ff0bb; box-shadow: 0 0 9px #8ff0bb55; }
  .live-dot.offline { background: var(--ink-dim); }
  .table-menu { position: fixed; inset: calc(68px + env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) auto auto; inline-size: min(310px, calc(100vw - 24px)); max-block-size: calc(100dvh - 84px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); margin: 0; overflow: auto; padding: 20px; border: 1px solid var(--gold-line); border-radius: 18px; color: var(--ink); background: #111b16; box-shadow: 0 20px 70px #0009; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  h2 { margin: 5px 0 0; font-size: 20px; letter-spacing: 0.06em; font-weight: 650; }
  .eyebrow { font-size: 9px; }
  .dismiss { inline-size: 30px; min-block-size: 30px; padding: 0; font-size: 19px; border-color: var(--line); }
  .connection { margin-block: 20px; font-size: 11px; color: var(--gold); text-transform: capitalize; }
  .connection.online { color: #8ff0bb; }
  dl { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 0; padding-block: 18px; border-block: 1px solid var(--line); }
  dt { color: var(--ink-dim); font-size: 11px; }
  dd { margin: 5px 0 0; font-size: 14px; text-transform: capitalize; overflow-wrap: anywhere; }
  .menu-actions { display: grid; gap: 8px; margin-block-start: 18px; }
  .menu-actions button { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
  .leave-table { border-color: var(--line); color: #efa5a5; }
  .copy-status { margin: 0; color: var(--ink-dim); font-size: 11px; line-height: 1.5; }
  input { font-size: 11px; }
  @media (max-height: 500px) {
    .table-menu { padding: 12px; inset-block-start: calc(54px + env(safe-area-inset-top)); max-block-size: calc(100dvh - 70px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); }
    .connection { margin-block: 10px; }
    dl { gap: 8px; padding-block: 10px; }
    .menu-actions { margin-block-start: 10px; }
  }
</style>
