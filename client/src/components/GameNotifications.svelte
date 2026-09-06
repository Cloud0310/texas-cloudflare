<script module lang="ts">
  export type GameNotification = {
    id: number;
    kind: "turn" | "success" | "error";
    title: string;
    message: string;
    expiresAt: number | null;
  };
</script>

<script lang="ts">
  let { notifications, connectionStatus, hasSession, ondismiss }: {
    notifications: GameNotification[];
    connectionStatus: "connecting" | "connected" | "reconnecting" | "offline";
    hasSession: boolean;
    ondismiss: (id: number) => void;
  } = $props();

  let panel: HTMLDivElement;
  const supportsPopover = "showPopover" in HTMLElement.prototype;
  let connecting = $derived(hasSession && connectionStatus !== "connected");
  let visible = $derived(connecting || notifications.length > 0);

  $effect(() => {
    if (!panel || !supportsPopover) return;
    if (visible) panel.showPopover();
    else panel.hidePopover();
  });

  $effect(() => {
    const timers = notifications.flatMap((notification) => notification.expiresAt === null
      ? []
      : [setTimeout(() => ondismiss(notification.id), Math.max(0, notification.expiresAt - Date.now()))]);
    return () => timers.forEach(clearTimeout);
  });
</script>

<div bind:this={panel} class="notification-center" popover={supportsPopover ? "manual" : undefined} hidden={!visible} aria-label="Game notifications">
  <div class="notification-list">
    <div role="status" aria-live="polite" aria-atomic="true">
      {#if connecting}
        <div class="notification connection">
          <span class="notification-icon" aria-hidden="true">↻</span>
          <div>
            <strong>{connectionStatus === "connecting" ? "Connecting…" : "Connection lost · Reconnecting…"}</strong>
            <p>{connectionStatus === "connecting"
              ? "Connecting to your table."
              : "Trying to reconnect automatically. Disconnected seats have a 30-second grace period."}</p>
          </div>
        </div>
      {/if}
    </div>
    <div class="notification-list" aria-live="polite" aria-relevant="additions text">
      {#each notifications as notification (notification.id)}
        <div class="notification" class:turn={notification.kind === "turn"} class:success={notification.kind === "success"} class:failure={notification.kind === "error"} role={notification.kind === "error" ? "alert" : "status"} aria-atomic="true">
          <span class="notification-icon" aria-hidden="true">{notification.kind === "turn" ? "♠" : notification.kind === "error" ? "!" : "✓"}</span>
          <div><strong>{notification.title}</strong><p>{notification.message}</p></div>
          <button class="ghost" type="button" aria-label={`Dismiss ${notification.title}`} onclick={() => ondismiss(notification.id)}>×</button>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .notification-center {
    position: fixed;
    z-index: 10;
    inset: calc(80px + env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) auto auto;
    inline-size: min(400px, calc(100% - 24px));
    max-block-size: calc(100dvh - 100px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    margin: 0;
    padding: 4px;
    overflow: auto;
    border: 0;
    background: transparent;
    color: var(--ink);
    pointer-events: none;
  }
  .notification-list { display: grid; gap: 8px; }
  .notification-list > div:empty { display: none; }
  .notification {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 10px;
    padding: 14px;
    border: 1px solid var(--gold-line);
    border-radius: 14px;
    background: #18261d;
    box-shadow: 0 8px 24px #0005;
    pointer-events: auto;
  }
  .notification-icon { color: var(--gold); font-size: 22px; font-weight: 800; }
  strong { display: block; font-size: 16px; line-height: 1.4; }
  p { margin: 4px 0 0; color: var(--ink-dim); font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
  button { inline-size: 44px; min-block-size: 44px; padding: 0; font-size: 22px; }
  .turn { border-color: var(--gold); }
  .success { border-color: #8ff0bb77; }
  .success .notification-icon { color: #8ff0bb; }
  .failure { border-color: #ff9c9c88; background: #2c1b18; }
  .failure .notification-icon { color: #ff9c9c; }
  @media (max-height: 500px) {
    .notification-center { inset-block-start: max(8px, env(safe-area-inset-top)); max-block-size: calc(100dvh - 16px); }
  }
</style>
