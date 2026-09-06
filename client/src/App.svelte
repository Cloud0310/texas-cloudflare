<script lang="ts">
  import { heroForState, type ClientMessage, type JoinResponse, type ServerMessage, type TableState } from "@texas/shared";
  import { onMount } from "svelte";
  import GameNotifications, { type GameNotification } from "./components/GameNotifications.svelte";
  import Lobby from "./components/Lobby.svelte";
  import PokerTable from "./components/PokerTable.svelte";
  import { connectTable, sendMessage } from "./lib/socket";

  type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";

  const params = new URLSearchParams(window.location.search);
  const invitedTableId = params.get("table");

  let tableId = invitedTableId ?? localStorage.getItem("tableId") ?? "";
  let playerId =
    params.get("player") ?? (invitedTableId ? null : localStorage.getItem("playerId"));
  let state: TableState | null = null;
  let socket: WebSocket | null = null;
  let notifications: GameNotification[] = [];
  let notificationId = 0;
  let connectionStatus: ConnectionStatus = tableId && playerId ? "connecting" : "offline";
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let socketGeneration = 0;

  function notify(kind: GameNotification["kind"], title: string, message: string): void {
    notifications = [
      ...notifications.filter((item) => item.kind !== kind || item.message !== message),
      { id: ++notificationId, kind, title, message, expiresAt: kind === "error" ? null : Date.now() + (kind === "turn" ? 8_000 : 5_000) },
    ].slice(-3);
  }

  function dismissNotification(id: number): void {
    notifications = notifications.filter((item) => item.id !== id);
  }

  function acceptState(next: TableState): void {
    const reconnected = connectionStatus === "reconnecting";
    const myTurn = next.currentPlayerId === playerId;
    const newTurn = myTurn && (state?.currentPlayerId !== playerId || state?.handNumber !== next.handNumber || state?.phase !== next.phase);
    state = next;
    connectionStatus = "connected";
    reconnectAttempts = 0;
    if (!myTurn || newTurn) notifications = notifications.filter((item) => item.kind !== "turn");
    if (reconnected) notify("success", "Reconnected", myTurn ? "It's your turn. Choose your next action at the table." : "Your table is up to date. You can continue playing.");
    else if (newTurn) notify("turn", "Your turn", "Choose your next action at the table.");
  }

  function setSessionUrl(nextTableId: string, nextPlayerId: string): void {
    const next = new URL(window.location.href);
    next.searchParams.set("table", nextTableId);
    next.searchParams.set("player", nextPlayerId);
    window.history.replaceState({}, "", next);
  }

  function clearSessionUrl(): void {
    const next = new URL(window.location.href);
    next.searchParams.delete("table");
    next.searchParams.delete("player");
    window.history.replaceState({}, "", next.pathname + next.search + next.hash);
  }

  function saveSession(nextTableId: string, nextPlayerId: string): void {
    localStorage.setItem("tableId", nextTableId);
    localStorage.setItem("playerId", nextPlayerId);
    setSessionUrl(nextTableId, nextPlayerId);
  }

  function clearSession(): void {
    localStorage.removeItem("tableId");
    localStorage.removeItem("playerId");
    clearSessionUrl();
  }

  function clearPlayerSession(): void {
    socketGeneration += 1;
    clearReconnectTimer();
    connectionStatus = "offline";
    localStorage.removeItem("playerId");
    playerId = null;
    state = null;
    socket?.close();
    socket = null;
    const next = new URL(window.location.href);
    next.searchParams.delete("player");
    window.history.replaceState({}, "", next);
  }

  function clearReconnectTimer(): void {
    if (!reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function openSocket(id: string, pid: string | null) {
    clearReconnectTimer();
    const generation = ++socketGeneration;
    socket?.close();
    socket = null;
    if (!pid) return;
    connectionStatus = reconnectAttempts > 0 ? "reconnecting" : "connecting";
    socket = connectTable(id, pid, {
      onMessage: (message) => { if (generation === socketGeneration) handleSocketMessage(message); },
      onClose: () => { if (generation === socketGeneration) scheduleReconnect(); },
      onError: () => { if (generation === socketGeneration) scheduleReconnect(); },
      onInvalidMessage: () => {
        if (generation === socketGeneration) notify("error", "Table update failed", "Received an invalid table update. Waiting for the next update.");
      },
    });
  }

  function scheduleReconnect(): void {
    if (!tableId || !playerId || reconnectTimer) return;

    socketGeneration += 1;
    socket?.close();
    socket = null;
    connectionStatus = "reconnecting";
    notifications = notifications.filter((item) => item.kind !== "turn");
    const delay = Math.min(8_000, 500 * 2 ** reconnectAttempts);
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openSocket(tableId, playerId);
    }, delay);
  }

  function handleSocketMessage(message: ServerMessage) {
    if (message.type === "snapshot") {
      if (playerId && !heroForState(message.state, playerId)) {
        notify("error", "Seat unavailable", "This saved seat no longer exists. Join the table again.");
        clearPlayerSession();
        return;
      }
      acceptState(message.state);
    }
    if (message.type === "joined") {
      playerId = message.playerId;
      acceptState(message.state);
      saveSession(tableId, message.playerId);
    }
    if (message.type === "error") notify("error", "Action failed", message.message);
  }

  function send(message: ClientMessage): void {
    notifications = notifications.filter((item) => item.kind !== "error" && (message.type !== "action" || item.kind !== "turn"));
    if (!sendMessage(socket, message)) {
      notify("error", "Action not sent", "Your action was not sent. Please try again.");
      scheduleReconnect();
    }
  }

  function handleJoined(joined: JoinResponse) {
    tableId = joined.tableId;
    playerId = joined.playerId;
    state = joined.state;
    saveSession(tableId, playerId);
    reconnectAttempts = 0;
    openSocket(tableId, playerId);
  }

  function resetTable() {
    socketGeneration += 1;
    clearReconnectTimer();
    clearSession();
    socket?.close();
    socket = null;
    tableId = "";
    playerId = null;
    state = null;
    notifications = [];
    connectionStatus = "offline";
  }

  onMount(() => {
    if (tableId && playerId) openSocket(tableId, playerId);
    return () => {
      socketGeneration += 1;
      clearReconnectTimer();
      socket?.close();
    };
  });

  $: myTurn = connectionStatus === "connected" && state?.currentPlayerId === playerId && Boolean(playerId);
</script>

<svelte:head>
  <title>{myTurn ? "Your turn · " : connectionStatus === "reconnecting" ? "Reconnecting · " : ""}Texas Hold'em</title>
</svelte:head>

<GameNotifications {notifications} {connectionStatus} hasSession={Boolean(tableId && playerId)} ondismiss={dismissNotification} />

<main class="app-shell">
  {#if state && tableId && playerId}
    <PokerTable
      tableState={state}
      {playerId}
      {connectionStatus}
      onaction={(action) => send({ type: "action", action })}
      onstart={() => send({ type: "start" })}
      onnextHand={() => send({ type: "nextHand" })}
      onleave={resetTable}
    />
  {:else}
    <Lobby {tableId} onjoined={handleJoined} />
  {/if}
</main>
