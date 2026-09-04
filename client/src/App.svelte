<script lang="ts">
  import { heroForState, type PlayerAction, type ServerMessage, type TableState } from "@texas/shared";
  import Lobby from "./components/Lobby.svelte";
  import PokerTable from "./components/PokerTable.svelte";
  import { connectTable, sendMessage } from "./lib/socket";

  type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";

  const params = new URLSearchParams(window.location.search);

  let tableId = params.get("table") ?? localStorage.getItem("tableId") ?? "";
  let playerId = params.get("player") ?? localStorage.getItem("playerId");
  let state: TableState | null = null;
  let socket: WebSocket | null = null;
  let notice = "";
  let connectionStatus: ConnectionStatus = tableId && playerId ? "connecting" : "offline";
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let shouldReconnect = true;
  let replacingSocket = false;

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
    if (socket) {
      replacingSocket = true;
      socket.close();
    }
    if (!pid) return;
    connectionStatus = reconnectAttempts > 0 ? "reconnecting" : "connecting";
    socket = connectTable(id, pid, {
      onOpen: handleSocketOpen,
      onMessage: handleSocketMessage,
      onClose: scheduleReconnect,
      onError: scheduleReconnect,
      onInvalidMessage: () => {
        notice = "Received an invalid table update. Waiting for the next update.";
      },
    });
  }

  function handleSocketOpen(): void {
    reconnectAttempts = 0;
    connectionStatus = "connected";
    notice = "";
  }

  function scheduleReconnect(): void {
    if (replacingSocket) {
      replacingSocket = false;
      return;
    }
    if (!shouldReconnect || !tableId || !playerId || reconnectTimer) return;

    socket = null;
    connectionStatus = "reconnecting";
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
        notice = "This saved seat no longer exists. Join the table again.";
        clearPlayerSession();
        return;
      }
      state = message.state;
    }
    if (message.type === "joined") {
      playerId = message.playerId;
      state = message.state;
      saveSession(tableId, message.playerId);
    }
    if (message.type === "error") notice = message.message;
  }

  function sendAction(action: PlayerAction): void {
    if (!sendMessage(socket, { type: "action", action })) notice = "Reconnecting. Try again in a moment.";
  }

  function sendTableMessage(type: "start" | "nextHand"): void {
    if (!sendMessage(socket, { type })) notice = "Reconnecting. Try again in a moment.";
  }

  function handleJoined(event: CustomEvent<{ tableId: string; playerId: string; state: TableState }>) {
    tableId = event.detail.tableId;
    playerId = event.detail.playerId;
    state = event.detail.state;
    saveSession(tableId, playerId);
    shouldReconnect = true;
    reconnectAttempts = 0;
    openSocket(tableId, playerId);
  }

  function resetTable() {
    shouldReconnect = false;
    clearReconnectTimer();
    clearSession();
    socket?.close();
    socket = null;
    tableId = "";
    playerId = null;
    state = null;
    notice = "";
    connectionStatus = "offline";
  }

  $: if (tableId && playerId && !socket) openSocket(tableId, playerId);
</script>

<main class="app-shell">
  {#if state && tableId && playerId}
    <PokerTable
      tableState={state}
      {playerId}
      {notice}
      {connectionStatus}
      onaction={sendAction}
      onstart={() => sendTableMessage("start")}
      onnextHand={() => sendTableMessage("nextHand")}
      onleave={resetTable}
    />
  {:else}
    <Lobby {tableId} onjoined={(detail) => handleJoined(new CustomEvent("joined", { detail }))} />
  {/if}
</main>
