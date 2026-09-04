import type { ClientMessage, ServerMessage } from "@texas/shared";
import { socketUrl } from "./api";

export type SocketCallbacks = {
  onOpen?: () => void;
  onMessage: (message: ServerMessage) => void;
  onClose?: () => void;
  onError?: () => void;
  onInvalidMessage?: () => void;
};

export function connectTable(
  tableId: string,
  playerId: string | null,
  callbacks: SocketCallbacks,
): WebSocket {
  const socket = new WebSocket(socketUrl(tableId, playerId));
  socket.addEventListener("open", () => callbacks.onOpen?.());
  socket.addEventListener("message", (event) => {
    try {
      callbacks.onMessage(JSON.parse(String(event.data)) as ServerMessage);
    } catch {
      callbacks.onInvalidMessage?.();
    }
  });
  socket.addEventListener("close", () => callbacks.onClose?.());
  socket.addEventListener("error", () => callbacks.onError?.());
  return socket;
}

export function sendMessage(socket: WebSocket | null, message: ClientMessage): boolean {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(message));
  return true;
}
