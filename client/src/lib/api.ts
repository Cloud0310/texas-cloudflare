import type { CreateTableResponse, JoinResponse } from "@texas/shared";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const error = (await response.json()) as { message?: string };
    return error.message ?? fallback;
  } catch {
    return fallback;
  }
}

export async function createTable(): Promise<CreateTableResponse> {
  const response = await fetch(`${apiBase}/api/tables`, { method: "POST" });
  if (!response.ok) throw new Error(await errorMessage(response, "Could not create table"));
  return response.json();
}

export async function joinTable(tableId: string, name: string): Promise<JoinResponse> {
  const response = await fetch(`${apiBase}/api/tables/${tableId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response, "Could not join table"));
  }
  return response.json();
}

export function socketUrl(tableId: string, playerId: string | null): string {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const base = configured ? new URL(configured) : new URL(window.location.origin);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = `/ws/tables/${tableId}`;
  base.search = playerId ? `playerId=${encodeURIComponent(playerId)}` : "";
  return base.toString();
}
